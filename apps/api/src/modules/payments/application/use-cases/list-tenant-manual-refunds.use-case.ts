import type { ManualRefundListQuery, ManualRefundListResponse } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toManualRefundListItem } from '../manual-refund.mapper';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';

@Injectable()
export class ListTenantManualRefundsUseCase {
  constructor(@Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository, private readonly tenantDb: TenantDbService) {}
  async execute(tenantId: string, query: ManualRefundListQuery): Promise<ManualRefundListResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const workflowEnabled = await this.operations.isWorkflowEnabled(tx, tenantId);
      const now = query.overdue ? await this.tenantDb.databaseNow(tx) : null;
      const result = await this.operations.listViews(tx, tenantId, query, now);
      return {
        workflowEnabled,
        items: result.items.map(toManualRefundListItem),
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
      };
    });
  }
}
