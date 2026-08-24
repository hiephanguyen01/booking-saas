import { Inject, Injectable } from '@nestjs/common';
import {
  isNewCheckoutPaymentMethod,
  type CheckoutResponse,
  type CustomerPaymentMethod,
} from '@booking/contracts';
import { v7 as uuidv7 } from 'uuid';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
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
import {
  REFUND_POLICY_REPOSITORY,
  type IRefundPolicyRepository,
} from '../../domain/ports/refund-policy-repository.port';
import { Payment } from '../../domain/entities/payment.entity';
import {
  InvalidStorefrontHost,
  PaymentMethodUnavailable,
  PaymentStorefrontSuspended,
} from '../../domain/errors/payment-errors';
import { GatewayOperationError } from '../../domain/errors/gateway-operation-error';

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
 * A) short DB tx resolves explicit routing + policy and creates/claims a local Payment attempt;
 * B) provider network call runs with no DB transaction open;
 * C) short DB tx attaches the provider handoff.
 */
@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(PAYMENT_BOOKING_READER) private readonly bookings: IPaymentBookingReader,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    @Inject(REFUND_POLICY_REPOSITORY) private readonly refundPolicies: IRefundPolicyRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    bookingId: string,
    paymentMethod: CustomerPaymentMethod,
  ): Promise<CheckoutResponse> {
    if (!isNewCheckoutPaymentMethod(paymentMethod)) {
      throw new PaymentMethodUnavailable();
    }

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
      const resolved = await this.registry.resolveActiveForMethod(tx, tenant.id, paymentMethod);
      const gateway = resolved.gateway;
      const providerPaymentMethod = gateway.providerPaymentMethod(paymentMethod);
      Payment.assertGatewayAccepts({
        gatewayKey: gateway.key,
        amount,
        isProductionEnv: process.env.NODE_ENV === 'production',
        allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === 'true',
      });
      const refundPolicy = await this.refundPolicies.get(tx, tenant.id);

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

      // An early provider webhook can win the race and mark the durable attempt
      // succeeded before Phase C attaches its handoff. If booking projection has
      // not caught up yet, reuse that same attempt rather than minting a second one.
      const latest = await this.payments.findLatestByBooking(tx, bookingId);
      if (
        latest?.status === 'succeeded' &&
        latest.kind === kind &&
        latest.paymentMethod === providerPaymentMethod &&
        (latest.checkoutState === 'creating' || latest.checkoutState === 'ready')
      ) {
        return { payment: latest, destination: null, bookingCode: booking.code };
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
            refundStrategySnapshot: refundPolicy.refundStrategy,
            manualRefundSlaHoursSnapshot: refundPolicy.manualRefundSlaHours,
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

    // A previously completed Phase C stays a pure local fast path for providers
    // whose handoff cannot become terminal behind our back. PayOS resources can be
    // cancelled or expire provider-side, so revalidate them by their stable orderCode.
    if (prepared.destination && prepared.payment.gateway !== 'payos') {
      return { paymentId: prepared.payment.id, destination: prepared.destination };
    }

    // Resolve the exact immutable config revision recorded in Phase A. A tenant
    // changing routes or rotating credentials now cannot redirect this in-flight attempt.
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
      // request reuses the same durable payment/reference. Definite create rejection
      // becomes create_failed so a new checkout attempt can be minted next time.
      if (error instanceof GatewayOperationError && error.kind !== 'retryable') {
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
