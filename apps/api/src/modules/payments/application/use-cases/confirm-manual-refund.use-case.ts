import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfirmManualRefundInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
  type RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
  type RefundRecord,
} from '../../domain/ports/refund-repository.port';
import { Refund } from '../../domain/entities/refund.entity';
import { RefundNotFound, RefundReferenceAlreadyUsed } from '../../domain/errors/refund-errors';

/** Tenant confirms the external bank transfer required by SePay/manual gateways. */
@Injectable()
export class ConfirmManualRefundUseCase {
  constructor(
    @Inject(REFUND_BATCH_REPOSITORY) private readonly refundBatches: IRefundBatchRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    refundId: string,
    input: ConfirmManualRefundInput,
    actorUserId: string,
  ): Promise<RefundRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      let found = await this.refunds.findById(tx, refundId);
      if (!found) throw new RefundNotFound();
      await this.refunds.lockForBooking(tx, found.bookingId);
      found = (await this.refunds.findById(tx, refundId)) ?? found;

      if (Refund.rehydrate(found).classifyConfirmation() === 'already_succeeded') {
        if (found.refundBatchId) {
          const refreshed = await this.refundBatches.refreshStatus(tx, found.refundBatchId);
          if (refreshed?.transitionedToCompleted) {
            await this.emitBatchCompletion(tx, tenantId, refreshed.batch);
          }
        }
        return found;
      }
      if (await this.refunds.manualReferenceExists(tx, tenantId, input.reference)) {
        throw new RefundReferenceAlreadyUsed();
      }

      const updated = await this.refunds.markSucceeded(tx, refundId, input);
      if (!updated) throw new NotFoundException();
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'refund.manual_confirmed',
        entityType: 'refund',
        entityId: updated.id,
        data: {
          reference: input.reference,
          evidenceKey: input.evidenceKey ?? null,
          note: input.note ?? null,
          amount: updated.amount.toString(),
        },
      });

      if (updated.refundBatchId) {
        const refreshed = await this.refundBatches.refreshStatus(tx, updated.refundBatchId);
        if (refreshed?.transitionedToCompleted) {
          await this.emitBatchCompletion(tx, tenantId, refreshed.batch);
        }
        return updated;
      }

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
      return updated;
    });
  }

  private emitBatchCompletion(
    tx: Parameters<IRefundBatchRepository['refreshStatus']>[0],
    tenantId: string,
    batch: RefundBatchRecord,
  ): Promise<unknown> {
    return this.outbox.emit(tx, {
      tenantId,
      eventType: 'refund.completed',
      payload: {
        refundId: batch.id,
        refundBatchId: batch.id,
        bookingId: batch.bookingId,
        amount: batch.requestedAmount.toString(),
        reason: batch.reason,
        affectsBookingStatus: batch.affectsBookingStatus,
      },
    });
  }
}
