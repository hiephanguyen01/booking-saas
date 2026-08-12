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
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';

/**
 * Removes a tenant's custom-domain mapping (§6.1). Ownership is enforced by
 * matching the domain's `tenantId` to the caller's scope — a mismatch (or a
 * missing id) resolves to 404. A verified primary domain can't be removed while
 * it's the only verified domain of its own kind, to avoid orphaning the live
 * storefront (or, symmetrically, the console).
 */
@Injectable()
export class DeleteDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const domain = await this.domains.findById(id);
    if (!domain || domain.tenantId !== tenantId) {
      throw new DomainNotFound();
    }
    const target = TenantDomain.rehydrate(domain);
    // Gate is for the query, not the rule — the assertion re-checks it. Keeps
    // listByTenantAndKind off the common delete path (non-primary/unverified
    // deletes never pay for the extra round-trip). Scoped to the target's own
    // kind so a storefront sibling can never save a dashboard host from deletion.
    if (target.isPrimary && target.isVerified) {
      const siblings = (await this.domains.listByTenantAndKind(tenantId, domain.kind)).map((d) => ({
        id: d.id,
        isVerified: d.verifiedAt !== null,
      }));
      assertDeletableFromPortfolio(
        { id: target.id, isPrimary: target.isPrimary, isVerified: target.isVerified },
        siblings,
      );
    }
    await this.domains.delete(id);
    await this.cache.invalidateHost(domain.hostname);
  }
}
