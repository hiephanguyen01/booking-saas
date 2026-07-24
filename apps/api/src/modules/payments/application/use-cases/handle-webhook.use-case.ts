import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
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
  BadWebhook,
  InvalidWebhookSignature,
} from '../payment-http-errors';

/**
 * The webhook — the single source of truth for payment (§11.2). Resolves the
 * tenant from the gateway txn (admin pool), verifies the signature, is idempotent
 * (an atomic non-succeeded→succeeded flip means 5 duplicate deliveries record one
 * payment and confirm once), guards the amount, then confirms the booking.
 */
@Injectable()
export class HandleWebhookUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    gatewayKey: GatewayKey,
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<void> {
    const ref = this.registry.statelessByKey(gatewayKey).peekReference(rawBody);
    if (!ref) throw new BadWebhook();

    const payment = await this.payments.findByGatewayReference(gatewayKey, ref);
    if (!payment) return; // unknown txn — acknowledge and ignore

    // Record the payment durably first (its own tx). markSucceeded is an atomic
    // non-succeeded→succeeded flip, so 5 duplicate deliveries return `true` exactly once.
    const flipped = await this.tenantDb.forTenant(payment.tenantId, async (tx) => {
      const gateway = await this.registry.resolveForTenant(tx, payment.tenantId, payment.gateway);
      const v = gateway.verifyWebhook(rawBody, headers);
      if (!v.valid) throw new InvalidWebhookSignature();

      // A SePay TRANSACTION_VOID confirms an already-recorded automatic refund; it
      // must never downgrade the original successful payment. A late/out-of-order
      // failed/expired only applies while still pending — the write is atomic
      // (UPDATE ... WHERE status = 'pending'), so a concurrent succeeded delivery is
      // never clobbered; the pre-tx snapshot can't be trusted under concurrent
      // webhooks (one-way machine, §11.2). The entity only picks which transition to
      // attempt; the guarded UPDATE decides whether it actually applies.
      const transition = Payment.decideWebhookTransition(v.event);
      if (transition.action === 'ignore') return false;
      if (transition.action === 'terminal') {
        await this.payments.markTerminalIfPending(tx, payment.id, transition.to);
        return false;
      }
      Payment.assertAmountCovers(payment.amount, v.amountVnd);
      const succeeded = await this.payments.markSucceeded(
        tx,
        payment.id,
        {
          event: v.event,
          amountVnd: v.amountVnd.toString(),
          gatewayOrderRef: v.gatewayOrderRef ?? ref,
        },
        {
          gatewayTxnId: v.gatewayTxnId,
          gatewayOrderId: v.gatewayOrderId,
          paymentMethod: v.paymentMethod,
        },
      );
      if (succeeded) {
        await this.outbox.emit(tx, {
          tenantId: payment.tenantId,
          eventType: 'payment.succeeded',
          payload: { paymentId: payment.id, bookingId: payment.bookingId },
        });
      }
      return succeeded;
    });

    // Booking and Finance consume `payment.succeeded` independently through the
    // retrying outbox. Never perform a one-shot cross-module confirmation here.
    if (!flipped) return;
  }
}
