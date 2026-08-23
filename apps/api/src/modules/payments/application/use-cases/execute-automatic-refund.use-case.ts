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
import { resolvePaymentRefundPolicy } from '../../domain/refund-policy-resolution';

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
      const policy = resolvePaymentRefundPolicy(payment, resolved.settings);
      return {
        refund,
        payment,
        gateway: resolved.gateway,
        manualRefundSlaHours: policy.manualRefundSlaHours,
      };
    });
    if (!prepared) return;

    const reference =
      prepared.payment.gatewayOrderRef ?? prepared.payment.gatewayTxnId ?? prepared.payment.id;
    const result = prepared.refund.gatewayRefundId
      ? await prepared.gateway.queryRefundStatus({
          refundId: prepared.refund.id,
          gatewayRefundId: prepared.refund.gatewayRefundId,
        })
      : await prepared.gateway.refund({
          refundId: prepared.refund.id,
          gatewayTxnId: prepared.payment.gatewayTxnId ?? reference,
          gatewayOrderRef: reference,
          amountVnd: prepared.refund.amount,
          reason: prepared.refund.reason ?? 'booking_cancellation',
        });

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.refunds.lockForBooking(tx, prepared.refund.bookingId);
      const current = await this.refunds.findById(tx, refundId);
      if (!current || !Refund.rehydrate(current).canExecuteAutomatically()) return;

      const gatewayRefundId =
        result.refundId ?? current.gatewayRefundId ?? prepared.refund.gatewayRefundId;

      if (result.status === 'succeeded') {
        const updated = await this.refunds.completeAutomatic(tx, refundId, gatewayRefundId);
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

      if (result.status === 'pending') {
        await this.refunds.markAutomaticPending(tx, refundId, gatewayRefundId);
        return;
      }

      if (result.status === 'failed') {
        await this.refunds.failAutomatic(tx, refundId, gatewayRefundId);
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