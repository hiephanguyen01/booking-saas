import type { ReopenManualRefundInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ManualRefundConcurrentUpdate, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { toManualRefundMutationResponse, toManualRefundOperation } from '../manual-refund.mapper';
import { MANUAL_REFUND_EVIDENCE_REPOSITORY, type IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';

@Injectable()
export class ReopenManualRefundDestinationUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, @Inject(MANUAL_REFUND_EVIDENCE_REPOSITORY) private readonly evidence: IManualRefundEvidenceRepository, @Inject(STORAGE_PORT) private readonly storage: StoragePort, @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, operationId: string, input: ReopenManualRefundInput, actorUserId: string) {
    const invalidatedKeys = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      const now = await this.tenantDb.databaseNow(tx);
      const entity = toManualRefundOperation(current); entity.reopen({ actorUserId, reason: input.reason, occurredAt: now });
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, input.expectedVersion, { status: 'awaiting_details', makerUserId: null, claimedAt: null, transferReference: null, evidenceObjectKey: null, evidenceContentType: null, evidenceSizeBytes: null, evidenceSha256: null, evidenceVerifiedAt: null, transferSubmittedByUserId: null, transferSubmittedAt: null, checkedByUserId: null, checkedAt: null, rejectionReason: null, reopenedByUserId: actorUserId, reopenReason: input.reason.trim(), reopenedAt: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      const keys = await this.evidence.invalidateUploads(tx, tenantId, operationId, now);
      await this.audit.write(tx, { tenantId, actorUserId, action: 'manual_refund.destination_reopened', entityType: 'manual_refund_operation', entityId: operationId, data: { reason: input.reason.trim() } });
      return { response: toManualRefundMutationResponse(updated), keys };
    });
    let failedQuarantineCount = 0;
    await Promise.all(invalidatedKeys.keys.map(async (key) => {
      try {
        await this.storage.quarantinePrivateObject(key);
      } catch {
        // The committed quarantined row and retained opaque key provide a
        // durable, private retry signal. Reopen remains successful.
        failedQuarantineCount += 1;
      }
    }));
    if (failedQuarantineCount > 0) {
      try {
        await this.tenantDb.forTenant(tenantId, async (tx) => {
          await this.audit.write(tx, {
            tenantId,
            actorUserId,
            action: 'manual_refund.evidence_quarantine_failed',
            entityType: 'manual_refund_operation',
            entityId: operationId,
            data: { failedObjectCount: failedQuarantineCount },
          });
        });
      } catch {
        // Storage retry remains driven by the committed quarantined rows even
        // if an operational audit append is unavailable.
      }
    }
    return invalidatedKeys.response;
  }
}
