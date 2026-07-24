import { Inject, Injectable } from '@nestjs/common';
import type { CancellationPolicyResponse, UpdateCancellationPolicyInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';
import { CancellationPolicy } from '../../domain/entities/cancellation-policy.entity';
import { CancellationPolicyNotFound } from '../../domain/errors/cancellation-policy-errors';

/** Updates only tenant-owned policies; partner-owned policies remain outside tenant settings. */
@Injectable()
export class UpdateTenantCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    id: string,
    input: UpdateCancellationPolicyInput,
  ): Promise<CancellationPolicyResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.policies.findById(tx, id);
      if (!existing) {
        throw new CancellationPolicyNotFound();
      }
      const policy = CancellationPolicy.rehydrate(existing);
      policy.assertTenantOwnedForEdit();
      const updated = await this.policies.update(
        tx,
        id,
        policy.applyUpdate({ name: input.name, rules: input.rules }),
      );
      const defaultId = await this.policies.findTenantDefaultId(tx, tenantId);
      return toCancellationPolicyResponse(updated, defaultId);
    });
  }
}
