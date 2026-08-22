import { Inject, Injectable } from '@nestjs/common';
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
import { Refund } from '../../domain/entities/refund.entity';

/** Executes the provider call after the refund intent is durably committed. */
@Injectable()
export class ExecuteAutomaticRefundUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, refundId: string): Promise<void> {
    const prepared = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const refund = await this.refunds.findById(tx, refundId);
      if (!refund) return null;
      const entity = Refund.rehydrate(refund);
      if (!entity.canExecuteAutomatically()) return null;

      // A durable refund already names its source transaction. Never substitute
      // the latest succeeded payment from the booking when multiple captures exist.
      const payment = await this.payments.findById(tx, refund.paymentId);
      if (!payment || payment.status !== 'succeeded' || !entity.isForPayment(payment)) return null;
      const resolved = await this.registry.resolveForPayment(tx, payment);
      return {
        refund,
        payment,
        gateway: resolved.gateway,
        manualRefundSlaHours: resolved.settings.manualRefundSlaHours,
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
