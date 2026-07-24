import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type DomainRecord,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { DomainNotFound } from '../../domain/errors/tenancy-errors';
import { TenantDomain } from '../../domain/entities/tenant-domain.entity';

/** Makes one verified domain primary for the current tenant. */
@Injectable()
export class SetPrimaryDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY)
    private readonly domains: ITenantDomainRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, id: string): Promise<DomainRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const domain = await this.domains.findById(id, tx);
      if (!domain) {
        throw new DomainNotFound();
      }
      const d = TenantDomain.rehydrate(domain);
      d.assertCanBecomePrimary();
      if (d.isPrimary) return domain;
      return this.domains.setPrimary(tenantId, id, tx);
    });
  }
}
