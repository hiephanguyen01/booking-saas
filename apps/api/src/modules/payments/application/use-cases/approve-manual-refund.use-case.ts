import type { ApproveManualRefundInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  ManualRefundConcurrentUpdate,
  ManualRefundMakerCannotApproveOwnTransfer,
  ManualRefundEvidenceRequired,
  ManualRefundOperationNotFound,
} from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
  type ManualRefundOperationRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../../domain/ports/refund-repository.port';
import { MANUAL_REFUND_EVIDENCE_REPOSITORY, type IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import { toManualRefundOperation } from '../manual-refund.mapper';

export interface ManualRefundCompletionResult {
  id: string;
  status: 'completed';
  version: number;
  completedAt: Date | null;
}

@Injectable()
export class ApproveManualRefundUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly batches: IRefundBatchRepository,
    @Inject(MANUAL_REFUND_EVIDENCE_REPOSITORY) private readonly evidence: IManualRefundEvidenceRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    operationId: string,
    input: ApproveManualRefundInput,
    checkerUserId: string,
  ): Promise<ManualRefundCompletionResult> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (current.makerUserId === checkerUserId) {
        throw new ManualRefundMakerCannotApproveOwnTransfer();
      }
      if (current.status === 'completed') return toCompletionResult(current);
      await this.assertEvidence(tx, tenantId, current);

      const operation = toManualRefundOperation(current);
      operation.approve(checkerUserId);
      const now = await this.tenantDb.databaseNow(tx);
      const updated = await this.operations.casUpdate(
        tx,
        tenantId,
        operationId,
        current.status,
        input.expectedVersion,
        {
          status: 'completed',
          checkedByUserId: checkerUserId,
          checkedAt: now,
          completedAt: now,
        },
      );
      if (!updated) throw new ManualRefundConcurrentUpdate();

      const completedChildren = await this.refunds.completeManualBatch(
        tx,
        tenantId,
        current.refundBatchId,
        now,
        current.transferReference as string,
      );
      const refreshed = await this.batches.refreshStatus(tx, current.refundBatchId);
      if (!refreshed || refreshed.batch.status !== 'completed') {
        throw new ManualRefundConcurrentUpdate();
      }

      await this.audit.write(tx, {
        tenantId,
        actorUserId: checkerUserId,
        action: 'manual_refund.approved',
        entityType: 'manual_refund_operation',
        entityId: operationId,
        data: {
          completedChildCount: completedChildren,
          notePresent: Boolean(input.note?.trim()),
        },
      });
      if (refreshed.transitionedToCompleted) {
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'refund.completed',
          payload: {
            refundId: refreshed.batch.id,
            refundBatchId: refreshed.batch.id,
            bookingId: refreshed.batch.bookingId,
            amount: refreshed.batch.requestedAmount.toString(),
            reason: refreshed.batch.reason,
            affectsBookingStatus: refreshed.batch.affectsBookingStatus,
          },
        });
      }
      return toCompletionResult(updated);
    });
  }

  private async assertEvidence(tx: Parameters<IManualRefundEvidenceRepository['findUpload']>[0], tenantId: string, current: ManualRefundOperationRecord): Promise<void> {
    if (!current.evidenceObjectKey || !current.evidenceSha256 || !current.evidenceContentType || !current.evidenceSizeBytes) throw new ManualRefundEvidenceRequired();
    const upload = await this.evidence.findUpload(tx, tenantId, current.id, current.evidenceObjectKey);
    if (!upload || upload.status !== 'claimed' || upload.checksum !== current.evidenceSha256 || upload.contentType !== current.evidenceContentType || upload.sizeBytes !== current.evidenceSizeBytes) throw new ManualRefundEvidenceRequired();
    const inspection = await this.storage.inspectPrivateFile({ key: upload.objectKey, allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'], maxSizeBytes: 10 * 1024 * 1024 });
    if (!inspection.valid || inspection.checksum !== upload.checksum || inspection.contentType !== upload.contentType || inspection.sizeBytes !== upload.sizeBytes) throw new ManualRefundEvidenceRequired();
  }
}

function toCompletionResult(record: ManualRefundOperationRecord): ManualRefundCompletionResult {
  return {
    id: record.id,
    status: 'completed',
    version: record.version,
    completedAt: record.completedAt,
  };
}
