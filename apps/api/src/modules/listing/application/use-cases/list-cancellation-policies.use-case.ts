import { Injectable } from '@nestjs/common';
import type { CancellationPolicySummary } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';

@Injectable()
export class ListCancellationPoliciesUseCase {
  constructor(private readonly tenantDb: TenantDbService) {}

  execute(tenantId: string): Promise<CancellationPolicySummary[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const policies = await tx.cancellationPolicy.findMany({ orderBy: { name: 'asc' } });
      return policies.map((policy) => ({ id: policy.id, name: policy.name, rules: policy.rules }));
    });
  }
}
