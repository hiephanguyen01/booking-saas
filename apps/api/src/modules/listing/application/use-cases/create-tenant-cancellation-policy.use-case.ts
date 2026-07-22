import { Inject, Injectable } from '@nestjs/common';
import type { CancellationPolicyResponse, CreateCancellationPolicyInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

/** Creates a tenant-owned cancellation policy shared with every partner in the tenant. */
@Injectable()
export class CreateTenantCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    input: CreateCancellationPolicyInput,
  ): Promise<CancellationPolicyResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const created = await this.policies.create(tx, tenantId, {
        partnerId: null,
        name: input.name,
        rules: input.rules,
      });
      const defaultId = await this.policies.findTenantDefaultId(tx, tenantId);
      return toCancellationPolicyResponse(created, defaultId);
    });
  }
}
