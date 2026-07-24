import { Inject, Injectable } from '@nestjs/common';
import type { UpdateTenantInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';

/**
 * Updates tenant profile/status. A status change flips the storefront live/
 * suspended state, so every mapped host is evicted from the resolution cache.
 */
@Injectable()
export class UpdateTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(id: string, input: UpdateTenantInput): Promise<TenantRecord> {
    if (!(await this.tenants.findById(id))) {
      throw new TenantNotFound();
    }
    const tenant = await this.tenants.update(id, input);
    if (input.status !== undefined) {
      const hosts = await this.domains.listByTenant(id);
      await Promise.all(hosts.map((h) => this.cache.invalidateHost(h.hostname)));
    }
    return tenant;
  }
}
