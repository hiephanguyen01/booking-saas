import { Inject, Injectable } from '@nestjs/common';
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

/** Executes the provider call after the refund intent is durably committed. */
@Injectable()
export class ExecuteAutomaticRefundUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, refundId: string): Promise<void> {
    const prepared = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const refund = await this.refunds.findById(tx, refundId);
      if (!refund || refund.status !== 'pending' || refund.executionMode !== 'automatic')
        return null;
      const payment = await this.payments.findSucceededByBooking(tx, refund.bookingId);
      if (!payment || payment.id !== refund.paymentId) return null;
      const gateway = await this.registry.resolveForTenant(tx, tenantId, payment.gateway);
      const config = await this.configs.findActive(tx, tenantId);
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
    });

    // If a previous attempt voided successfully but crashed before persisting,
    // a repeated void may be rejected. Provider status makes that retry safe.
    if (!result.supported) {
      const status = await prepared.gateway.queryPaymentStatus(reference);
      if (status.status === 'refunded') {
        result = { supported: true, refundId: `reconciled:void:${reference}` };
      }
    }

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.refunds.lockForBooking(tx, prepared.refund.bookingId);
      const current = await this.refunds.findById(tx, refundId);
      if (!current || current.status !== 'pending' || current.executionMode !== 'automatic') return;

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

      const dueAt = new Date(Date.now() + prepared.manualRefundSlaHours * 60 * 60 * 1000);
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
