import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(HandleWebhookUseCase.name);

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
    if (!ref) {
      if (gatewayKey === 'momo') {
        this.logger.warn('momo webhook rejected reason=missing_reference');
      }
      throw new BadWebhook();
    }

    const payment = await this.payments.findByGatewayReference(gatewayKey, ref);
    if (!payment) {
      if (gatewayKey === 'momo') {
        this.logger.debug(`momo webhook ignored ref=${ref} reason=unknown_reference`);
      }
      return;
    }

    // Record the payment durably first (its own tx). markSucceeded is an atomic
    // non-succeeded→succeeded flip, so 5 duplicate deliveries return `true` exactly once.
    const flipped = await this.tenantDb.forTenant(payment.tenantId, async (tx) => {
      const gateway = await this.registry.resolveForTenant(tx, payment.tenantId, payment.gateway);
      const v = gateway.verifyWebhook(rawBody, headers);
      if (!v.valid) {
        if (gatewayKey === 'momo') {
          this.logger.warn(
            `momo webhook rejected tenant=${payment.tenantId} payment=${payment.id} ref=${ref} event=${v.event} reason=verification_failed`,
          );
        }
        throw new InvalidWebhookSignature();
      }

      // A SePay TRANSACTION_VOID confirms an already-recorded automatic refund; it
      // must never downgrade the original successful payment. A late/out-of-order
      // failed/expired only applies while still pending — the write is atomic
      // (UPDATE ... WHERE status = 'pending'), so a concurrent succeeded delivery is
      // never clobbered; the pre-tx snapshot can't be trusted under concurrent
      // webhooks (one-way machine, §11.2). The entity only picks which transition to
      // attempt; the guarded UPDATE decides whether it actually applies.
      const transition = Payment.decideWebhookTransition(v.event);
      if (transition.action === 'ignore') {
        if (gatewayKey === 'momo') {
          this.logger.debug(
            `momo webhook ignored tenant=${payment.tenantId} payment=${payment.id} ref=${ref} event=${v.event}`,
          );
        }
        return false;
      }
      if (transition.action === 'terminal') {
        await this.payments.markTerminalIfPending(tx, payment.id, transition.to);
        if (gatewayKey === 'momo') {
          this.logger.log(
            `momo webhook terminal tenant=${payment.tenantId} payment=${payment.id} ref=${ref} status=${transition.to}`,
          );
        }
        return false;
      }
      try {
        Payment.assertAmountCovers(payment.amount, v.amountVnd);
      } catch (error) {
        if (gatewayKey === 'momo') {
          this.logger.warn(
            `momo webhook rejected tenant=${payment.tenantId} payment=${payment.id} ref=${ref} reason=amount_mismatch expected=${payment.amount} received=${v.amountVnd}`,
          );
        }
        throw error;
      }
      const succeeded = await this.payments.markSucceeded(
        tx,
        payment.id,
        {
          event: 'succeeded',
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
        if (gatewayKey === 'momo') {
          this.logger.log(
            `momo webhook succeeded tenant=${payment.tenantId} payment=${payment.id} ref=${ref} txnId=${v.gatewayTxnId}`,
          );
        }
      } else if (gatewayKey === 'momo') {
        this.logger.debug(
          `momo webhook duplicate tenant=${payment.tenantId} payment=${payment.id} ref=${ref}`,
        );
      }
      return succeeded;
    });

    // Booking and Finance consume `payment.succeeded` independently through the
    // retrying outbox. Never perform a one-shot cross-module confirmation here.
    if (!flipped) return;
  }
}
