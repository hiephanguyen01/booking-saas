import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
  type PaymentRecord,
} from '../../domain/ports/payment-repository.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../../domain/ports/refund-repository.port';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  GATEWAY_REGISTRY,
  type GatewayRegistryPort,
} from '../../domain/ports/gateway-registry.port';
import { Refund } from '../../domain/entities/refund.entity';
import { allocateRefundNewestFirst } from '../../domain/refund-allocation';
import {
  paymentRefundPolicySnapshot,
  resolvePaymentRefundPolicy,
} from '../../domain/refund-policy-resolution';

/**
 * Plan one business refund across exact successful source captures. Child intents
 * are durable before any provider execution; provider I/O remains in the automatic
 * executor after this transaction commits.
 */
@Injectable()
export class ExecuteRefundUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly refundBatches: IRefundBatchRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly manualRefundOperations: IManualRefundOperationRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    amount: bigint,
    reason = 'booking_cancellation',
    affectsBookingStatus = reason !== 'security_deposit',
  ): Promise<void> {
    if (amount <= 0n) return;

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.refunds.lockForBooking(tx, bookingId);
      if (await this.refundBatches.findByBookingReason(tx, bookingId, reason)) return;

      const sources = await this.sourcesForReason(tx, bookingId, reason);
      if (sources.length === 0) return;

      const capacities = [] as Array<{ paymentId: string; availableAmount: bigint }>;
      for (const payment of sources) {
        const capturedAmount = payment.capturedAmount ?? payment.amount;
        const reservedAmount = await this.refunds.reservedAmountForPayment(tx, payment.id);
        capacities.push({
          paymentId: payment.id,
          availableAmount: capturedAmount - reservedAmount,
        });
      }

      // Allocation is computed before the first write. Aggregate shortfall therefore
      // leaves neither a partial batch nor partially-created children behind.
      const allocations = allocateRefundNewestFirst(amount, capacities);
      const batch = await this.refundBatches.create(tx, tenantId, {
        bookingId,
        requestedAmount: amount,
        reason,
        affectsBookingStatus,
      });
      const sourcesById = new Map(sources.map((payment) => [payment.id, payment]));

      for (const allocation of allocations) {
        const payment = sourcesById.get(allocation.paymentId);
        if (!payment)
          throw new Error(`Refund allocation source ${allocation.paymentId} disappeared`);

        // A complete Payment snapshot is authoritative. Only legacy Payments with
        // no policy snapshot consult their exact immutable gateway config revision.
        let policy = paymentRefundPolicySnapshot(payment);
        if (!policy) {
          const resolved = await this.registry.resolveForPayment(tx, payment);
          policy = resolvePaymentRefundPolicy(payment, resolved.settings);
        }

        const capturedAmount = payment.capturedAmount ?? payment.amount;
        const planned = Refund.plan({
          payment: {
            id: payment.id,
            amount: capturedAmount,
            gateway: payment.gateway,
            paymentMethod: payment.paymentMethod,
          },
          bookingId,
          amount: allocation.amount,
          reason,
          affectsBookingStatus,
          settings: policy,
          now: new Date(),
        });
        const refund = await this.refunds.create(tx, tenantId, {
          ...planned,
          refundBatchId: batch.id,
        });
        await this.outbox.emit(tx, {
          tenantId,
          eventType:
            planned.executionMode === 'automatic'
              ? 'refund.execution_requested'
              : 'refund.requested',
          payload: {
            refundId: refund.id,
            refundBatchId: batch.id,
            paymentId: payment.id,
            bookingId,
            amount: allocation.amount.toString(),
            reason,
            affectsBookingStatus,
          },
        });
      }

      // Initial manual children must make a mixed/manual batch visible as
      // manual_required immediately; all-automatic batches remain processing.
      const refreshed = await this.refundBatches.refreshStatus(tx, batch.id);
      if (
        refreshed?.batch.status === 'manual_required' &&
        (await this.manualRefundOperations.isWorkflowEnabled(tx, tenantId))
      ) {
        await this.manualRefundOperations.createForBatch(tx, tenantId, batch.id);
      }
    });
  }

  private async sourcesForReason(
    tx: Parameters<IPaymentRepository['findById']>[0],
    bookingId: string,
    reason: string,
  ): Promise<PaymentRecord[]> {
    if (reason === 'security_deposit') {
      const source = await this.payments.findSecurityDepositSource(tx, bookingId);
      return source ? [source] : [];
    }
    return this.payments.findSucceededRefundSources(tx, bookingId);
  }
}
