import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutResponse } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { BOOKING_REPOSITORY, type IBookingRepository } from '../../../booking/domain/ports/booking-repository.port';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { GatewayRegistry } from '../../infrastructure/gateway-registry';

/**
 * The tenant's OWN storefront origin — each tenant serves on its own dynamic
 * domain (`tenant_domains`), so the return/cancel URLs must point back to the
 * host the customer is actually on, never a single global storefront.
 */
function storefrontOrigin(host: string): string {
  const scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return `${scheme}://${host}`;
}

/**
 * Create a gateway payment for a booking (§11.2). Amount = deposit + security
 * deposit (the security deposit is refunded on return, §9.4). Returns the
 * paymentUrl; the webhook — not the returnUrl — later confirms the booking.
 */
@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    private readonly registry: GatewayRegistry,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, bookingId: string): Promise<CheckoutResponse> {
    const tenant = await this.resolveTenant.execute(host);
    if (!tenant.live) {
      throw new ForbiddenException({ statusCode: 403, code: 'STOREFRONT_SUSPENDED', message: 'This storefront is not accepting payments' });
    }
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      if (booking.status !== 'pending_payment') {
        throw new BadRequestException({ statusCode: 400, code: 'BOOKING_NOT_PAYABLE', message: `Booking is ${booking.status}, not awaiting payment` });
      }

      // Idempotent: reuse the existing pending payment link rather than minting a
      // second gateway payment (which could double-charge on a retry/double-click).
      const existing = await this.payments.findPendingCheckout(tx, bookingId);
      if (existing) return { paymentId: existing.id, paymentUrl: existing.paymentUrl };

      const amount = booking.depositAmount + booking.securityDeposit;
      const kind = booking.depositAmount >= booking.finalAmount ? 'full' : 'deposit';
      const origin = storefrontOrigin(host); // the tenant's own domain (from the Host the customer used)
      const gateway = await this.registry.resolveForTenant(tx, tenant.id);
      const created = await gateway.createPayment({
        amountVnd: amount,
        orderCode: String(Date.now()),
        description: `Booking ${booking.code}`,
        returnUrl: `${origin}/bookings/${booking.code}`,
        cancelUrl: `${origin}/bookings/${booking.code}?cancelled=1`,
        expiresInSec: 900,
      });
      const payment = await this.payments.create(tx, tenant.id, {
        bookingId,
        gateway: gateway.key,
        kind,
        amount,
        gatewayTxnId: created.gatewayTxnId,
        idempotencyKey: `checkout:${bookingId}:${created.gatewayTxnId}`,
        gatewayPayload: { paymentUrl: created.paymentUrl },
      });
      return { paymentId: payment.id, paymentUrl: created.paymentUrl };
    });
  }
}
