import type { ManualRefundWorkflowEnableResponse } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';

@Injectable()
export class EnableManualRefundWorkflowUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, actorUserId: string): Promise<ManualRefundWorkflowEnableResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.operations.enableWorkflow(tx, tenantId);
      const batches = await this.operations.findManualRequiredBatchesWithoutOperation(tx, tenantId);
      let createdOperations = 0;
      for (const batch of batches) {
        const created = await this.operations.createForBatch(tx, tenantId, batch.refundBatchId);
        if (!created) continue;
        createdOperations += 1;
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'manual_refund.destination_requested',
          payload: {
            refundBatchId: batch.refundBatchId,
            bookingId: batch.bookingId,
          },
        });
      }
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'manual_refund.workflow_enabled',
        entityType: 'tenant',
        entityId: tenantId,
        data: { createdOperations },
      });
      return { enabled: true, createdOperations };
    });
  }
}
