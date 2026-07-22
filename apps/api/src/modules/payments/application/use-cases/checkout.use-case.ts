import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CheckoutResponse } from '@booking/contracts';
import { DEFAULT_GATEWAY_PAYMENT_SETTINGS, type CustomerPaymentMethod } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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
import { MOMO_MAX_PAYMENT_VND } from '../../domain/gateway-limits';
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
      if (!booking)
        throw new NotFoundException({
          statusCode: 404,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found',
        });
      if (booking.status !== 'pending_payment') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'BOOKING_NOT_PAYABLE',
          message: `Booking is ${booking.status}, not awaiting payment`,
        });
      }

      const config = await this.configs.findActive(tx, tenant.id);
      const settings = config?.settings ?? DEFAULT_GATEWAY_PAYMENT_SETTINGS;
      if (!settings.enabledMethods.includes(paymentMethod)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PAYMENT_METHOD_UNAVAILABLE',
          message: 'The selected payment method is not enabled for this storefront',
        });
      }
      const gateway = await this.registry.resolveForTenant(tx, tenant.id);
      const providerPaymentMethod = gateway.providerPaymentMethod(paymentMethod);

      // Idempotent: reuse the existing pending payment link rather than minting a
      // second gateway payment (which could double-charge on a retry/double-click).
      const existing = await this.payments.findPendingCheckout(
        tx,
        bookingId,
        providerPaymentMethod,
      );
      if (existing) return { paymentId: existing.id, destination: existing.destination };

      const amount = booking.depositAmount + booking.securityDeposit;
      const kind = booking.depositAmount >= booking.finalAmount ? 'full' : 'deposit';
      const origin = storefrontOrigin(host); // the tenant's own domain (from the Host the customer used)
      // No active gateway → registry falls back to mock. That is only acceptable in
      // dev/test; in production, refuse rather than silently take fake payments.
      if (
        gateway.key === 'mock' &&
        process.env.NODE_ENV === 'production' &&
        process.env.ALLOW_MOCK_PAYMENTS !== 'true'
      ) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'NO_ACTIVE_GATEWAY',
          message: 'Cửa hàng chưa bật cổng thanh toán',
        });
      }
      // MoMo caps a single payment/refund at 50M VND. Reject over-limit orders up
      // front so every MoMo booking stays fully auto-refundable (refund ≤ amount).
      if (gateway.key === 'momo' && amount > MOMO_MAX_PAYMENT_VND) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'AMOUNT_EXCEEDS_GATEWAY_LIMIT',
          message: 'Đơn hàng vượt hạn mức thanh toán MoMo (tối đa 50.000.000đ)',
        });
      }
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
