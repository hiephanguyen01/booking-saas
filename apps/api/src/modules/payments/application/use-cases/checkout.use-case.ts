import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CheckoutResponse } from '@booking/contracts';
import type { CustomerPaymentMethod } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { pickConfigForMethod } from '../../domain/method-routing';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PAYMENT_BOOKING_READER,
  type IPaymentBookingReader,
} from '../../domain/ports/payment-booking-reader.port';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/ports/payment-repository.port';
import {
  GATEWAY_REGISTRY,
  type GatewayRegistryPort,
} from '../../domain/ports/gateway-registry.port';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentMethodUnavailable } from '../../domain/errors/payment-errors';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';

/**
 * The tenant's OWN storefront origin — each tenant serves on its own dynamic
 * domain (`tenant_domains`), so the return/cancel URLs must point back to the
 * host the customer is actually on, never a single global storefront.
 */
function storefrontOrigin(host: string): string {
  const scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  let url: URL;
  try {
    url = new URL(`${scheme}://${host.trim()}`);
  } catch {
    throw invalidStorefrontHost();
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname
  ) {
    throw invalidStorefrontHost();
  }
  return url.origin;
}

function invalidStorefrontHost(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_STOREFRONT_HOST',
    message: 'The storefront Host header is invalid',
  });
}

/**
 * Create a gateway payment for a booking (§11.2). Amount = deposit + security
 * deposit (the security deposit is refunded on return, §9.4). Returns a
 * normalized provider handoff; the webhook — not the return URL — confirms it.
 */
@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(PAYMENT_BOOKING_READER) private readonly bookings: IPaymentBookingReader,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    bookingId: string,
    paymentMethod: CustomerPaymentMethod,
  ): Promise<CheckoutResponse> {
    const tenant = await this.resolveTenant.execute(host);
    if (!tenant.live) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'STOREFRONT_SUSPENDED',
        message: 'This storefront is not accepting payments',
      });
    }
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();
      Payment.assertPayable(booking);

      const configs = await this.configs.findActiveAll(tx, tenant.id);
      const routed = pickConfigForMethod(configs, paymentMethod);
      if (!routed && configs.length > 0) {
        throw new PaymentMethodUnavailable();
      }
      // configs rỗng → resolveForTenant trả mock (dev); guard NO_ACTIVE_GATEWAY prod giữ nguyên phía dưới
      const gateway = await this.registry.resolveForTenant(tx, tenant.id, routed?.gateway);
      const providerPaymentMethod = gateway.providerPaymentMethod(paymentMethod);

      // Idempotent per method: with parallel wallet gateways, a booking could end up
      // with 2 pending links (e.g. one MoMo, one ZaloPay) if the customer switches
      // methods before either resolves — the webhook confirms whichever one succeeds
      // first, the other is left to expire via reconciliation. Acceptable trade-off.
      const existing = await this.payments.findPendingCheckout(
        tx,
        bookingId,
        providerPaymentMethod,
      );
      if (existing) return { paymentId: existing.id, destination: existing.destination };

      const { amount, kind } = Payment.plan(booking);
      const origin = storefrontOrigin(host); // the tenant's own domain (from the Host the customer used)
      Payment.assertGatewayAccepts({
        gatewayKey: gateway.key,
        amount,
        isProductionEnv: process.env.NODE_ENV === 'production',
        allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === 'true',
      });
      const orderRef = `BKF-${randomUUID().replaceAll('-', '').toUpperCase()}`;
      const bookingReturnUrl = `${origin}/bookings/${booking.code}`;
      const created = await gateway.createPayment({
        amountVnd: amount,
        orderCode: orderRef,
        description: `Booking ${booking.code}`,
        returnUrl: `${bookingReturnUrl}?payment=success`,
        errorUrl: `${bookingReturnUrl}?payment=error`,
        cancelUrl: `${bookingReturnUrl}?payment=cancel`,
        expiresInSec: 900,
        paymentMethod,
      });
      const payment = await this.payments.create(tx, tenant.id, {
        bookingId,
        gateway: gateway.key,
        kind,
        amount,
        gatewayTxnId: created.gatewayTxnId ?? null,
        gatewayOrderRef: created.gatewayOrderRef ?? orderRef,
        paymentMethod: created.paymentMethod ?? providerPaymentMethod,
        idempotencyKey: `checkout:${bookingId}:${paymentMethod}:${created.gatewayOrderRef ?? created.gatewayTxnId ?? orderRef}`,
        gatewayPayload: { destination: created.destination },
      });
      return { paymentId: payment.id, destination: created.destination };
    });
  }
}
