import type { ManualRefundReadinessResponse } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  MANUAL_REFUND_READINESS_PORT,
  type ManualRefundReadinessPort,
} from '../../domain/ports/manual-refund-readiness.port';

@Injectable()
export class GetManualRefundReadinessUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(MANUAL_REFUND_READINESS_PORT)
    private readonly readiness: ManualRefundReadinessPort,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string): Promise<ManualRefundReadinessResponse> {
    const workflow = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.operations.getWorkflowState(tx, tenantId),
    );
    const checks = await this.readiness.inspect(tenantId);
    const ready = checks.every((c) => c.ok);
    return {
      ready,
      workflow,
      checks,
    };
  }
}
