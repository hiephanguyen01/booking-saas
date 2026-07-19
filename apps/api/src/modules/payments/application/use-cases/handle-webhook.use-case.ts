import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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
import { amountMatches } from '../../domain/payment-status';

/**
 * The webhook — the single source of truth for payment (§11.2). Resolves the
 * tenant from the gateway txn (admin pool), verifies the signature, is idempotent
 * (an atomic pending→succeeded flip means 5 duplicate deliveries record one
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
    if (!ref)
      throw new BadRequestException({
        statusCode: 400,
        code: 'BAD_WEBHOOK',
        message: 'Unparseable webhook',
      });

    const payment = await this.payments.findByGatewayReference(gatewayKey, ref);
    if (!payment) return; // unknown txn — acknowledge and ignore

    // Record the payment durably first (its own tx). markSucceeded is an atomic
    // pending→succeeded flip, so 5 duplicate deliveries return `true` exactly once.
    const flipped = await this.tenantDb.forTenant(payment.tenantId, async (tx) => {
      const gateway = await this.registry.resolveForTenant(tx, payment.tenantId, payment.gateway);
      const v = gateway.verifyWebhook(rawBody, headers);
      if (!v.valid)
        throw new UnauthorizedException({
          statusCode: 401,
          code: 'INVALID_SIGNATURE',
          message: 'Webhook signature invalid',
        });

      if (v.event !== 'succeeded') {
        // One-way machine (§11.2): a late/out-of-order failed/expired only applies
        // while still pending. The write is atomic (UPDATE ... WHERE status =
        // 'pending'), so a concurrent succeeded delivery is never clobbered — the
        // pre-tx snapshot can't be trusted under concurrent webhooks.
        await this.payments.markTerminalIfPending(
          tx,
          payment.id,
          v.event === 'expired' ? 'expired' : 'failed',
        );
        return false;
      }
      if (!amountMatches(payment.amount, v.amountVnd)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'AMOUNT_MISMATCH',
          message: 'Paid amount is less than expected',
        });
      }
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
