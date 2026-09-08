import {
  manualRefundWorkflowControlInputSchema,
  type ManualRefundWorkflowControlInput,
  type ManualRefundWorkflowState,
} from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ManualRefundWorkflowDisabled } from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';

@Injectable()
export class PauseManualRefundWorkflowUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    input: ManualRefundWorkflowControlInput,
    actorUserId: string,
  ): Promise<ManualRefundWorkflowState> {
    const control = manualRefundWorkflowControlInputSchema.parse(input);
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const workflow = await this.operations.getWorkflowState(tx, tenantId);
      if (!workflow.enabled) throw new ManualRefundWorkflowDisabled();
      await this.operations.setWorkflowPaused(tx, tenantId, true);
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'manual_refund.workflow_paused',
        entityType: 'tenant',
        entityId: tenantId,
        data: { reason: control.reason, severity: 'high' },
      });
      return { enabled: true, paused: true };
    });
  }
}
