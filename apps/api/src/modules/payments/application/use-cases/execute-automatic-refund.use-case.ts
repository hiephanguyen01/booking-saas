import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_GATEWAY_PAYMENT_SETTINGS } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/ports/payment-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../../domain/ports/refund-repository.port';
import {
  GATEWAY_REGISTRY,
  type GatewayRegistryPort,
} from '../../domain/ports/gateway-registry.port';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import { Refund } from '../../domain/entities/refund.entity';

/** Executes the provider call after the refund intent is durably committed. */
@Injectable()
export class ExecuteAutomaticRefundUseCase {
  private readonly logger = new Logger(ExecuteAutomaticRefundUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, refundId: string, attempt = 0): Promise<void> {
    const prepared = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const refund = await this.refunds.findById(tx, refundId);
      if (!refund) return null;
      const entity = Refund.rehydrate(refund);
      if (!entity.canExecuteAutomatically()) return null;
      const payment = await this.payments.findSucceededByBooking(tx, refund.bookingId);
      if (!payment || !entity.isForPayment(payment)) return null;
      const gateway = await this.registry.resolveForTenant(tx, tenantId, payment.gateway);
      // Parallel gateways: settings must come from the PAYMENT's own gateway, not
      // the base config (which may not even be the gateway that took the payment).
      const config = await this.configs.findByGateway(tx, tenantId, payment.gateway);
      return {
        refund,
        payment,
        gateway,
        manualRefundSlaHours:
          config?.settings.manualRefundSlaHours ??
          DEFAULT_GATEWAY_PAYMENT_SETTINGS.manualRefundSlaHours,
      };
    });
    if (!prepared) return;

    const reference =
      prepared.payment.gatewayOrderRef ?? prepared.payment.gatewayTxnId ?? prepared.payment.id;
    let result = await prepared.gateway.refund({
      gatewayTxnId: prepared.payment.gatewayTxnId ?? reference,
      gatewayOrderRef: reference,
      amountVnd: prepared.refund.amount,
      reason: prepared.refund.reason ?? 'booking_cancellation',
      attempt,
    });

    if (result.pending) {
      this.logger.warn(
        `refund pending tenant=${tenantId} refund=${refundId} payment=${prepared.payment.id} gateway=${prepared.payment.gateway} orderRef=${reference} attempt=${attempt}`,
      );
      // The same durable outbox event is retried, so the provider attempt identity
      // stays unchanged until MoMo reports a final result.
      throw new Error(`Gateway refund attempt ${attempt} is still pending`);
    }

    if (result.retryAfterSec !== undefined) {
      this.logger.warn(
        `refund retry scheduled tenant=${tenantId} refund=${refundId} payment=${prepared.payment.id} gateway=${prepared.payment.gateway} orderRef=${reference} attempt=${attempt} delaySec=${result.retryAfterSec}`,
      );
      await this.tenantDb.forTenant(tenantId, async (tx) => {
        await this.refunds.lockForBooking(tx, prepared.refund.bookingId);
        const current = await this.refunds.findById(tx, refundId);
        if (!current || !Refund.rehydrate(current).canExecuteAutomatically()) return;
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'refund.execution_requested',
          payload: { refundId, attempt: attempt + 1 },
          availableAt: new Date(Date.now() + result.retryAfterSec * 1_000),
        });
      });
      return;
    }

    // Generic recovery for gateways such as SePay: if a prior provider operation
    // succeeded but persistence crashed, provider status can still prove refund truth.
    if (!result.supported) {
      const status = await prepared.gateway.queryPaymentStatus(reference);
      if (status.status === 'refunded') {
        result = { supported: true, refundId: `reconciled:void:${reference}` };
      }
    }

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.refunds.lockForBooking(tx, prepared.refund.bookingId);
      const current = await this.refunds.findById(tx, refundId);
      if (!current || !Refund.rehydrate(current).canExecuteAutomatically()) return;

      if (result.supported) {
        const updated = await this.refunds.completeAutomatic(tx, refundId, result.refundId ?? null);
        if (!updated) return;
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'refund.completed',
          payload: {
            refundId: updated.id,
            paymentId: updated.paymentId,
            bookingId: updated.bookingId,
            amount: updated.amount.toString(),
            reason: updated.reason,
            affectsBookingStatus: updated.affectsBookingStatus,
          },
        });
        return;
      }

      const dueAt = Refund.manualDueAt(prepared.manualRefundSlaHours, new Date());
      const updated = await this.refunds.requireManual(tx, refundId, dueAt);
      if (!updated) return;
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'refund.requested',
        payload: {
          refundId: updated.id,
          paymentId: updated.paymentId,
          bookingId: updated.bookingId,
          amount: updated.amount.toString(),
          reason: updated.reason,
          affectsBookingStatus: updated.affectsBookingStatus,
        },
      });
    });
  }
}
