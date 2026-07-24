import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { Tenant } from '../../domain/entities/tenant.entity';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';

/**
 * Flip the `partnerPromotionsEnabled` feature flag on the tenant (§12.2). The
 * read-merge-write lives here (not the controller) so the flag is toggled while
 * the rest of `settings` is preserved.
 */
@Injectable()
export class SetPartnerPromotionsUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(tenantId: string, enabled: boolean): Promise<TenantRecord> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFound();
    }
    const patch = Tenant.rehydrate(tenant).togglePartnerPromotions(enabled);
    return this.tenants.update(tenantId, patch);
  }
}
