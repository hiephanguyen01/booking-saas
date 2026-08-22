import { Inject, Injectable } from '@nestjs/common';
import type { CheckoutResponse, CustomerPaymentMethod } from '@booking/contracts';
import { v7 as uuidv7 } from 'uuid';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { pickConfigForMethod } from '../../domain/method-routing';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PAYMENT_BOOKING_READER,
  type IPaymentBookingReader,
} from '../../domain/ports/payment-booking-reader.port';
import {
  CheckoutOrderReferenceCollision,
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
  type PaymentRecord,
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
import { GatewayRequestError } from '../../infrastructure/gateways/provider-http';

const LOCAL_REFERENCE_RETRIES = 3;

function storefrontOrigin(host: string): string {
  const scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  let url: URL;
  try {
    url = new URL(`${scheme}://${host.trim()}`);
  } catch {
    throw new InvalidStorefrontHost();
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname
  ) {
    throw new InvalidStorefrontHost();
  }
  return url.origin;
}

interface CheckoutPhaseA {
  payment: PaymentRecord;
  destination: CheckoutResponse['destination'] | null;
  bookingCode: string;
}

/**
 * Durable checkout is split into three phases:
 * A) short DB tx creates/claims a local Payment attempt;
 * B) provider network call runs with no DB transaction open;
 * C) short DB tx attaches the provider handoff.
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
    if (!tenant.live) throw new PaymentStorefrontSuspended();

    const origin = storefrontOrigin(host);

    // Phase A: all local validation/routing plus durable attempt creation in one
    // short tenant transaction. There is deliberately no provider I/O here.
    const prepared = await this.tenantDb.forTenant(tenant.id, async (tx): Promise<CheckoutPhaseA> => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();

      const isBalance = booking.status === 'confirmed';
      if (isBalance) Payment.assertBalancePayable(booking);
      else Payment.assertPayable(booking);

      const { amount, kind } = isBalance ? Payment.planBalance(booking) : Payment.plan(booking);
      const configs = await this.configs.findActiveAll(tx, tenant.id);
      const routed = pickConfigForMethod(configs, paymentMethod);
      if (!routed && configs.length > 0) throw new PaymentMethodUnavailable();

      const resolved = await this.registry.resolveActiveForCheckout(tx, tenant.id, routed?.gateway);
      const gateway = resolved.gateway;
      const providerPaymentMethod = gateway.providerPaymentMethod(paymentMethod);
      Payment.assertGatewayAccepts({
        gatewayKey: gateway.key,
        amount,
        isProductionEnv: process.env.NODE_ENV === 'production',
        allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === 'true',
      });

      await this.payments.lockCheckoutAttempt(tx, bookingId, kind, providerPaymentMethod);
      const reusable = await this.payments.findReusableCheckoutAttempt(
        tx,
        bookingId,
        kind,
        providerPaymentMethod,
      );
      if (reusable) {
        return {
          payment: reusable.payment,
          destination: reusable.destination,
          bookingCode: booking.code,
        };
      }

      for (let attempt = 0; attempt < LOCAL_REFERENCE_RETRIES; attempt++) {
        const paymentId = uuidv7();
        const gatewayOrderRef = gateway.prepareOrderReference(paymentId);
        try {
          const payment = await this.payments.createPendingCheckout(tx, tenant.id, {
            id: paymentId,
            bookingId,
            gateway: gateway.key,
            kind,
            amount,
            checkoutState: 'creating',
            gatewayConfigRevisionId: resolved.configRevisionId,
            gatewayOrderRef,
            paymentMethod: providerPaymentMethod,
            idempotencyKey: `checkout:${paymentId}`,
          });
          return { payment, destination: null, bookingCode: booking.code };
        } catch (error) {
          if (error instanceof CheckoutOrderReferenceCollision) continue;
          throw error;
        }
      }

      throw new Error('Unable to allocate a unique checkout order reference');
    });

    // A previously completed Phase C is a pure local fast path: double-clicks and
    // retries never touch the provider again.
    if (prepared.destination) {
      return { paymentId: prepared.payment.id, destination: prepared.destination };
    }

    // Resolve the exact immutable config revision recorded in Phase A. A tenant
    // rotating credentials now cannot switch this in-flight attempt to new keys.
    const resolved = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.registry.resolveForPayment(tx, prepared.payment),
    );
    const gateway = resolved.gateway;
    const bookingReturnUrl = `${origin}/bookings/${prepared.bookingCode}`;

    // Phase B: provider call with NO DB transaction open.
    let created;
    try {
      created = await gateway.createPayment({
        paymentId: prepared.payment.id,
        gatewayOrderRef: prepared.payment.gatewayOrderRef,
        amountVnd: prepared.payment.amount,
        description: `Booking ${prepared.bookingCode}`,
        returnUrl: `${bookingReturnUrl}?payment=success`,
        errorUrl: `${bookingReturnUrl}?payment=error`,
        cancelUrl: `${bookingReturnUrl}?payment=cancel`,
        expiresInSec: 900,
        paymentMethod,
      });
    } catch (error) {
      // Retryable transport/timeout failures intentionally keep `creating`; the next
      // request reuses the same durable payment/reference. Definite payOS rejection
      // becomes create_failed so a new checkout attempt can be minted next time.
      if (error instanceof GatewayRequestError && error.kind !== 'retryable') {
        await this.tenantDb.forTenant(tenant.id, (tx) =>
          this.payments.markCheckoutCreateFailed(tx, prepared.payment.id),
        );
      }
      throw error;
    }

    // Phase C: attach handoff/provider ids. This write accepts a concurrently
    // succeeded payment so an early webhook cannot make us lose the checkout URL.
    // Undefined optional provider ids are intentionally omitted: an early webhook
    // may already have persisted the definitive transaction id.
    const attached = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.payments.markCheckoutReady(tx, prepared.payment.id, {
        destination: created.destination,
        gatewayTxnId: created.gatewayTxnId,
        gatewayOrderRef: created.gatewayOrderRef ?? prepared.payment.gatewayOrderRef,
        paymentMethod: created.paymentMethod ?? prepared.payment.paymentMethod,
      }),
    );
    if (!attached) throw new Error('Checkout attempt is no longer active');

    return { paymentId: prepared.payment.id, destination: created.destination };
  }
}
