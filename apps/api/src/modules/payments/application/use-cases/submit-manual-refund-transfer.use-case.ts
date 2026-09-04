import type { SubmitManualRefundTransferInput } from '@booking/contracts';
import { MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES } from '@booking/contracts';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import { ManualRefundConcurrentUpdate, ManualRefundEvidenceUploadInvalid, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_EVIDENCE_REPOSITORY, type IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { isManualRefundEvidenceKey } from '../../domain/manual-refund-evidence-key';
import { toManualRefundMutationResponse, toManualRefundOperation } from '../manual-refund.mapper';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'] as const;

@Injectable()
export class SubmitManualRefundTransferUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, @Inject(MANUAL_REFUND_EVIDENCE_REPOSITORY) private readonly evidence: IManualRefundEvidenceRepository, @Inject(STORAGE_PORT) private readonly storage: StoragePort, @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter, private readonly tenantDb: TenantDbService, @Optional() private readonly outbox?: OutboxService) {}
  async execute(tenantId: string, operationId: string, input: SubmitManualRefundTransferInput, actorUserId: string) {
    const outcome = await this.tenantDb.forTenant(tenantId, async (tx) => {
      if (!isManualRefundEvidenceKey(tenantId, operationId, input.evidenceObjectKey)) throw new ManualRefundEvidenceUploadInvalid();
      const upload = await this.evidence.findUpload(tx, tenantId, operationId, input.evidenceObjectKey);
      if (!upload || upload.status !== 'pending') throw new ManualRefundEvidenceUploadInvalid();
      const now = await this.tenantDb.databaseNow(tx);
      if (upload.expiresAt <= now) throw new ManualRefundEvidenceUploadInvalid();
      const inspection = await this.storage.inspectPrivateFile({ key: upload.objectKey, allowedContentTypes: ALLOWED, maxSizeBytes: MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES });
      if (!inspection.valid || inspection.contentType !== upload.contentType || inspection.sizeBytes !== upload.sizeBytes || inspection.checksum !== upload.checksum) {
        await this.evidence.quarantineUpload(tx, tenantId, upload.id, now);
        return { invalidEvidenceKey: upload.objectKey } as const;
      }
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (!(await this.evidence.claimUpload(tx, tenantId, upload.id, now))) throw new ManualRefundEvidenceUploadInvalid();
      const entity = toManualRefundOperation({ ...current, evidenceObjectKey: upload.objectKey, evidenceContentType: upload.contentType, evidenceSizeBytes: upload.sizeBytes, evidenceSha256: upload.checksum, evidenceVerifiedAt: now, transferReference: input.reference }); entity.submitTransfer(actorUserId);
      const reference = input.reference.trim().replace(/\s+/gu, ' ');
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, input.expectedVersion, { status: 'transfer_submitted', transferReference: reference, evidenceObjectKey: upload.objectKey, evidenceContentType: upload.contentType, evidenceSizeBytes: upload.sizeBytes, evidenceSha256: upload.checksum, evidenceVerifiedAt: now, transferSubmittedByUserId: actorUserId, transferSubmittedAt: now, checkerWaitingAt: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      await this.outbox?.emit(tx, { tenantId, eventType: 'manual_refund.transfer_submitted', payload: { operationId, refundBatchId: current.refundBatchId } });
      await this.audit.write(tx, { tenantId, actorUserId, action: 'manual_refund.transfer_submitted', entityType: 'manual_refund_operation', entityId: operationId, data: { evidencePresent: true } });
      return { response: toManualRefundMutationResponse(updated) } as const;
    });
    if ('invalidEvidenceKey' in outcome) {
      await this.storage.quarantinePrivateObject(outcome.invalidEvidenceKey!);
      throw new ManualRefundEvidenceUploadInvalid();
    }
    return outcome.response;
  }
}
