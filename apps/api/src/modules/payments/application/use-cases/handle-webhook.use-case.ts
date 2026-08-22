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
import { amountMatches } from '../../domain/payment-status';
import { BadWebhook, InvalidWebhookSignature } from '../payment-http-errors';

/** The verified webhook is the single source of truth for payment (§11.2). */
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
    if (!ref) throw new BadWebhook();

    const payment = await this.payments.findByGatewayReference(gatewayKey, ref);
    if (!payment) return;

    const flipped = await this.tenantDb.forTenant(payment.tenantId, async (tx) => {
      const resolved = await this.registry.resolveForPayment(tx, payment);
      const v = resolved.gateway.verifyWebhook(rawBody, headers);
      if (!v.valid) throw new InvalidWebhookSignature();

      const transition = Payment.decideWebhookTransition(v.event);
      if (transition.action === 'ignore') return false;
      if (transition.action === 'terminal') {
        await this.payments.markTerminalIfPending(tx, payment.id, transition.to);
        return false;
      }

      // Valid succeeded events with either under- OR over-payment are intentionally
      // acknowledged but quarantined. Persist the observed capture for operations,
      // do not settle, and do not make the provider retry a condition we understood.
      if (!amountMatches(payment.amount, v.amountVnd)) {
        await this.payments.recordCapturedAmountIfPending(tx, payment.id, v.amountVnd);
        this.logger.warn(
          `payment_amount_mismatch paymentId=${payment.id} gateway=${gatewayKey} expected=${payment.amount} captured=${v.amountVnd}`,
        );
        return false;
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
          capturedAmount: v.amountVnd,
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

    if (!flipped) return;
  }
}
