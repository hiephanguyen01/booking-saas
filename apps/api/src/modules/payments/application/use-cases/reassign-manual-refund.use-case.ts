import type { ReassignManualRefundInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ManualRefundConcurrentUpdate, ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { toManualRefundMutationResponse, toManualRefundOperation } from '../manual-refund.mapper';

@Injectable()
export class ReassignManualRefundUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, operationId: string, input: ReassignManualRefundInput, actorUserId: string) {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      const now = await this.tenantDb.databaseNow(tx);
      const entity = toManualRefundOperation(current); entity.reassign({ actorUserId, makerUserId: input.makerUserId, reason: input.reason, occurredAt: now });
      const updated = await this.operations.casUpdate(tx, tenantId, operationId, current.status, input.expectedVersion, { makerUserId: input.makerUserId, reassignedByUserId: actorUserId, reassignmentReason: input.reason.trim(), reassignedAt: now });
      if (!updated) throw new ManualRefundConcurrentUpdate();
      await this.audit.write(tx, { tenantId, actorUserId, action: 'manual_refund.reassigned', entityType: 'manual_refund_operation', entityId: operationId, data: { makerUserId: input.makerUserId, reason: input.reason.trim() } });
      return toManualRefundMutationResponse(updated);
    });
  }
}
