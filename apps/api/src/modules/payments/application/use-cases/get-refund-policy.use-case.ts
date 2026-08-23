import { Inject, Injectable } from '@nestjs/common';
import type { TenantRefundPolicy } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REFUND_POLICY_REPOSITORY,
  type IRefundPolicyRepository,
} from '../../domain/ports/refund-policy-repository.port';

@Injectable()
export class GetRefundPolicyUseCase {
  constructor(
    @Inject(REFUND_POLICY_REPOSITORY)
    private readonly policies: IRefundPolicyRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(): Promise<TenantRefundPolicy> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, (tx) => this.policies.get(tx, tenantId));
  }
}
