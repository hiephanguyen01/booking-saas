import { Inject, Injectable } from '@nestjs/common';
import type { CancellationPolicyResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

/** Tenant-level shared policies — the picker for the tenant's fallback default (§11.3). */
@Injectable()
export class ListTenantCancellationPoliciesUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<CancellationPolicyResponse[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [rows, defaultId] = await Promise.all([
        this.policies.listTenantLevel(tx),
        this.policies.findTenantDefaultId(tx, tenantId),
      ]);
      return rows.map((p) => toCancellationPolicyResponse(p, defaultId));
    });
  }
}
