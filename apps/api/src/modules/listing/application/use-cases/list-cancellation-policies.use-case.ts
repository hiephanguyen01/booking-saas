import { Inject, Injectable } from '@nestjs/common';
import type { CancellationPolicySummary } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

@Injectable()
export class ListCancellationPoliciesUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<CancellationPolicySummary[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.policies.list(tx));
  }
}
