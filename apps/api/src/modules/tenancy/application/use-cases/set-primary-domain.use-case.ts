import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type DomainRecord,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';

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
        throw new NotFoundException({
          statusCode: 404,
          code: 'DOMAIN_NOT_FOUND',
          message: 'Domain not found',
        });
      }
      if (!domain.verifiedAt) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'DOMAIN_NOT_VERIFIED',
          message: 'A domain must be verified before it can become primary',
        });
      }
      if (domain.isPrimary) return domain;
      return this.domains.setPrimary(tenantId, id, tx);
    });
  }
}
