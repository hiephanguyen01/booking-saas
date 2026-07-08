import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';

@Injectable()
export class ListDomainsUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
  ) {}

  execute(tenantId: string): Promise<DomainRecord[]> {
    return this.domains.listByTenant(tenantId);
  }
}
