import type { ReopenManualRefundInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ManualRefundConcurrentUpdate, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { toManualRefundOperation } from '../manual-refund.mapper';

@Injectable()
export class ReopenManualRefundDestinationUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, operationId: string, input: ReopenManualRefundInput, actorUserId: string) {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      const now = await this.tenantDb.databaseNow(tx);
      const entity = toManualRefundOperation(current); entity.reopen({ actorUserId, reason: input.reason, occurredAt: now });
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, input.expectedVersion, { status: 'awaiting_details', makerUserId: null, claimedAt: null, transferReference: null, evidenceObjectKey: null, evidenceContentType: null, evidenceSizeBytes: null, evidenceSha256: null, evidenceVerifiedAt: null, transferSubmittedByUserId: null, transferSubmittedAt: null, checkedByUserId: null, checkedAt: null, rejectionReason: null, reopenedByUserId: actorUserId, reopenReason: input.reason.trim(), reopenedAt: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      await this.audit.write(tx, { tenantId, actorUserId, action: 'manual_refund.destination_reopened', entityType: 'manual_refund_operation', entityId: operationId, data: { reason: input.reason.trim() } });
      return updated;
    });
  }
}
