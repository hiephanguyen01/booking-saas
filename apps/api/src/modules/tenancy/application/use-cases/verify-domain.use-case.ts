import { Inject, Injectable } from '@nestjs/common';
import { DomainNotFoundForTenant } from '../../domain/errors/tenancy-errors';
import { TenantDomain } from '../../domain/entities/tenant-domain.entity';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';
import {
  DOMAIN_VERIFICATION_QUEUE,
  type IDomainVerificationQueue,
} from '../../domain/ports/domain-verification-queue.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';

export interface VerifyDomainResult {
  status: 'verified' | 'checking';
  domain: DomainRecord;
}

/**
 * Triggers custom-domain verification (§6.1). Validates the request cheaply, then
 * hands the actual TXT lookup to a background worker (a slow resolver must not
 * block the request) and returns `checking`; the worker sets `verified_at` and
 * evicts the host cache once the record resolves. An already-verified domain
 * short-circuits to `verified`. This is also the manual "check now" affordance.
 */
@Injectable()
export class VerifyDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(DOMAIN_VERIFICATION_QUEUE) private readonly queue: IDomainVerificationQueue,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(tenantId: string, domainId: string): Promise<VerifyDomainResult> {
    const domain = await this.domains.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      throw new DomainNotFoundForTenant(domainId);
    }
    const d = TenantDomain.rehydrate(domain);
    if (d.isVerified) return { status: 'verified', domain };
    d.assertVerifiable();

    await this.queue.enqueue(tenantId, domainId);
    await this.cache.invalidateHost(domain.hostname);
    return { status: 'checking', domain };
  }
}
