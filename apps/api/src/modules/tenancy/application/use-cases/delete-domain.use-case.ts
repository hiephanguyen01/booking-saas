import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { DomainNotFound } from '../../domain/errors/tenancy-errors';
import {
  TenantDomain,
  assertDeletableFromPortfolio,
} from '../../domain/entities/tenant-domain.entity';

/**
 * Removes a tenant's custom-domain mapping (§6.1). Ownership is enforced by
 * matching the domain's `tenantId` to the caller's scope — a mismatch (or a
 * missing id) resolves to 404. A verified primary domain can't be removed while
 * it's the only verified domain, to avoid orphaning the live storefront.
 */
@Injectable()
export class DeleteDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const domain = await this.domains.findById(id);
    if (!domain || domain.tenantId !== tenantId) {
      throw new DomainNotFound();
    }
    const target = TenantDomain.rehydrate(domain);
    if (target.isPrimary && target.isVerified) {
      const siblings = (await this.domains.listByTenant(tenantId)).map((d) => ({
        id: d.id,
        isVerified: d.verifiedAt !== null,
      }));
      assertDeletableFromPortfolio(
        { id: target.id, isPrimary: target.isPrimary, isVerified: target.isVerified },
        siblings,
      );
    }
    await this.domains.delete(id);
  }
}
