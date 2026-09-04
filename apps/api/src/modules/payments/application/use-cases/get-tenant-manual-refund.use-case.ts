import type { ManualRefundDetailResponse } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { toManualRefundDetailResponse } from '../manual-refund.mapper';

@Injectable()
export class GetTenantManualRefundUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, operationId: string): Promise<ManualRefundDetailResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const view = await this.operations.findViewById(tx, tenantId, operationId);
      if (!view || view.operation.tenantId !== tenantId) throw new ManualRefundOperationNotFound();
      return toManualRefundDetailResponse(view);
    });
  }
}
