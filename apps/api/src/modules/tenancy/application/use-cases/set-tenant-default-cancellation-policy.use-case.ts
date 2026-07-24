import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { Tenant } from '../../domain/entities/tenant.entity';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';

/**
 * The tenant picks the platform-wide fallback cancellation policy (§11.3), applied
 * when neither a listing nor its partner sets one. The target must be a tenant-level
 * (shared) policy of this tenant; `null` clears it.
 */
@Injectable()
export class SetTenantDefaultCancellationPolicyUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(tenantId: string, policyId: string | null): Promise<TenantRecord> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFound();
    }
    const isTenantLevel =
      policyId !== null ? await this.tenants.isTenantLevelPolicy(tenantId, policyId) : true;
    const patch = Tenant.rehydrate(tenant).setDefaultCancellationPolicy(policyId, isTenantLevel);
    return this.tenants.update(tenantId, patch);
  }
}
