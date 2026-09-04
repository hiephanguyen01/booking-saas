import type { ClaimManualRefundInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ManualRefundConcurrentUpdate, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { toManualRefundOperation } from '../manual-refund.mapper';

@Injectable()
export class ClaimManualRefundUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, operationId: string, input: ClaimManualRefundInput, actorUserId: string) {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      const entity = toManualRefundOperation(current); entity.claim(actorUserId);
      const now = await this.tenantDb.databaseNow(tx);
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, input.expectedVersion, { makerUserId: actorUserId, claimedAt: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      await this.audit.write(tx, { tenantId, actorUserId, action: 'manual_refund.claimed', entityType: 'manual_refund_operation', entityId: operationId });
      return updated;
    });
  }
}
