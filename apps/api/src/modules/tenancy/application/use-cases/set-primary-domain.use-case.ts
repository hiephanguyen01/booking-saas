import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type DomainRecord,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { DomainNotFound } from '../../domain/errors/tenancy-errors';
import { TenantDomain } from '../../domain/entities/tenant-domain.entity';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';

/** Makes one verified domain primary for the current tenant. */
@Injectable()
export class SetPrimaryDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY)
    private readonly domains: ITenantDomainRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<DomainRecord> {
    const updated = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const domain = await this.domains.findById(id, tx);
      if (!domain) {
        throw new DomainNotFound();
      }
      const d = TenantDomain.rehydrate(domain);
      d.assertCanBecomePrimary();
      if (d.isPrimary) return domain;
      return this.domains.setPrimary(tenantId, id, tx);
    });
    await this.cache.invalidateHost(updated.hostname);
    return updated;
  }
}
