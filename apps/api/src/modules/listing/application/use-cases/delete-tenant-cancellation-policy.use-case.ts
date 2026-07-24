import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';
import { CancellationPolicy } from '../../domain/entities/cancellation-policy.entity';
import { CancellationPolicyNotFound } from '../../domain/errors/cancellation-policy-errors';

/** Deletes a tenant-owned policy unless a listing still references it directly. */
@Injectable()
export class DeleteTenantCancellationPolicyUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.policies.findById(tx, id);
      if (!existing) {
        throw new CancellationPolicyNotFound();
      }
      const policy = CancellationPolicy.rehydrate(existing);
      policy.assertTenantOwnedForDelete();
      const inUse = await this.policies.countListingsUsing(tx, id);
      policy.assertNotInUse(inUse);
      await this.policies.delete(tx, id);
    });
  }
}
