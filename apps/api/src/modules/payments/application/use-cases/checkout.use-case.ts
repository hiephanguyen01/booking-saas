import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  InvalidStorefrontHost,
  PaymentMethodUnavailable,
  PaymentStorefrontSuspended,
} from '../../domain/errors/payment-errors';
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

function invalidStorefrontHost(): InvalidStorefrontHost {
  return new InvalidStorefrontHost();
}

/**
 * Create a gateway payment for a booking (§11.2). Amount = deposit + security
 * deposit (the security deposit is refunded on return, §9.4). Returns a
 * normalized provider handoff; the webhook — not the return URL — confirms it.
 */
@Injectable()
export class CheckoutUseCase {
  private readonly logger = new Logger(CheckoutUseCase.name);

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
      throw new PaymentStorefrontSuspended();
    }

    const prepared = await this.tenantDb.forTenant(tenant.id, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();
      // Two legal shapes: the FIRST payment on a booking awaiting payment, and a
      // BALANCE payment on one already confirmed but not fully paid (§8.3). The
      // two guards stay separate so the deposit path keeps its strict
      // `pending_payment` check.
      const isBalance = booking.status === 'confirmed';
      if (isBalance) Payment.assertBalancePayable(booking);
      else Payment.assertPayable(booking);

      const configs = await this.configs.findActiveAll(tx, tenant.id);
      const routed = pickConfigForMethod(configs, paymentMethod);
      if (!routed && configs.length > 0) {
        throw new PaymentMethodUnavailable();
      }
      // configs rỗng → resolveForTenant trả mock (dev); guard NO_ACTIVE_GATEWAY prod giữ nguyên phía dưới
      const gateway = await this.registry.resolveForTenant(tx, tenant.id, routed?.gateway);
      const providerPaymentMethod = gateway.providerPaymentMethod(paymentMethod);
      const { amount, kind } = isBalance ? Payment.planBalance(booking) : Payment.plan(booking);
      const origin = storefrontOrigin(host); // the tenant's own domain (from the Host the customer used)
      Payment.assertGatewayAccepts({
        gatewayKey: gateway.key,
        amount,
        isProductionEnv: process.env.NODE_ENV === 'production',
        allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === 'true',
      });
      const bookingReturnUrl = `${origin}/bookings/${booking.code}`;
      const description = `Booking ${booking.code}`;
      const returnUrl = `${bookingReturnUrl}?payment=success`;
      const errorUrl = `${bookingReturnUrl}?payment=error`;
      const cancelUrl = `${bookingReturnUrl}?payment=cancel`;
      const expiresInSec = 900;
      const initiation = gateway.checkoutInitiation ?? 'provider_first';

      // Provider-first is intentionally kept as the current behavior for all
      // existing gateways except MoMo. The provider call remains inside this
      // transaction so this refactor does not change their lifecycle semantics.
      if (initiation === 'provider_first') {
        const existing = await this.payments.findPendingCheckout(
          tx,
          bookingId,
          providerPaymentMethod,
        );
        if (existing?.destination) {
          return {
            kind: 'response' as const,
            response: { paymentId: existing.id, destination: existing.destination },
          };
        }

        const orderRef = `BKF-${randomUUID().replaceAll('-', '').toUpperCase()}`;
        const created = await gateway.createPayment({
          amountVnd: amount,
          orderCode: orderRef,
          description,
          returnUrl,
          errorUrl,
          cancelUrl,
          expiresInSec,
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
        return {
          kind: 'response' as const,
          response: { paymentId: payment.id, destination: created.destination },
        };
      }

      // Persist-first: serialize the local find/create decision, then commit the
      // payment/reference before any provider I/O. A retry reuses the same row.
      await this.payments.lockCheckout(tx, bookingId, providerPaymentMethod);
      const pending = await this.payments.findPendingCheckout(
        tx,
        bookingId,
        providerPaymentMethod,
      );
      if (pending?.destination) {
        return {
          kind: 'response' as const,
          response: { paymentId: pending.id, destination: pending.destination },
        };
      }
      if (pending && !pending.gatewayOrderRef) {
        throw new Error('Pending persist-first payment is missing gatewayOrderRef');
      }

      const orderRef =
        pending?.gatewayOrderRef ?? `BKF-${randomUUID().replaceAll('-', '').toUpperCase()}`;
      const paymentId = pending
        ? pending.id
        : (
            await this.payments.create(tx, tenant.id, {
              bookingId,
              gateway: gateway.key,
              kind,
              amount,
              gatewayOrderRef: orderRef,
              paymentMethod: providerPaymentMethod,
              idempotencyKey: `checkout:${bookingId}:${paymentMethod}:${orderRef}`,
            })
          ).id;

      return {
        kind: 'provider_create' as const,
        tenantId: tenant.id,
        paymentId,
        gateway,
        gatewayKey: gateway.key,
        orderRef,
        amount,
        description,
        returnUrl,
        errorUrl,
        cancelUrl,
        expiresInSec,
        paymentMethod,
      };
    });

    if (prepared.kind === 'response') return prepared.response;

    try {
      const created = await prepared.gateway.createPayment({
        amountVnd: prepared.amount,
        orderCode: prepared.orderRef,
        description: prepared.description,
        returnUrl: prepared.returnUrl,
        errorUrl: prepared.errorUrl,
        cancelUrl: prepared.cancelUrl,
        expiresInSec: prepared.expiresInSec,
        paymentMethod: prepared.paymentMethod,
      });

      await this.tenantDb.forTenant(prepared.tenantId, (tx) =>
        this.payments.saveCheckoutDestination(tx, prepared.paymentId, created.destination),
      );

      return { paymentId: prepared.paymentId, destination: created.destination };
    } catch (error) {
      this.logger.warn(
        `persist-first checkout create failed tenant=${prepared.tenantId} payment=${prepared.paymentId} gateway=${prepared.gatewayKey} orderRef=${prepared.orderRef}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
