import { Inject, Injectable } from '@nestjs/common';
import type { PublicTenantResponse } from '@booking/contracts';
import { normalizeHostname } from '../../../../shared/http/hostname';
import { evaluateSubscription } from '../../domain/subscription-status';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';
import { toPublicTenantResponse } from '../tenancy.mapper';
import { UnknownTenantHost } from '../../domain/errors/tenancy-errors';

/**
 * Resolves a storefront Host header to its tenant (§6.1). Runs on the admin
 * pool (no tenant context exists yet — this IS the resolution). The host→tenant
 * mapping is cached in Redis (60s, negative caching for unknown hosts); the
 * `live` flag is computed fresh each call from tenant status + subscription +
 * legal-document readiness so an expiry — or a just-published fourth legal
 * document — takes effect immediately (§6.5, §7).
 */
@Injectable()
export class ResolveTenantByHostUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(rawHost: string): Promise<PublicTenantResponse> {
    const hostname = normalizeHostname(rawHost);
    // An unparseable Host is never a tenant — fail closed without a lookup, the
    // same way CheckDomainTlsAllowedUseCase does. Falling through would spend a
    // Redis read and a query on the empty key to reach this identical 404.
    if (!hostname) throw new UnknownTenantHost(rawHost);

    let cached = await this.cache.getHost(hostname);
    if (cached === undefined) {
      const domain = await this.domains.findByHostname(hostname);
      // Only a verified domain resolves — an unverified custom domain isn't live.
      cached = domain && domain.verifiedAt
        ? { tenantId: domain.tenantId, kind: domain.kind }
        : null;
      await this.cache.setHost(hostname, cached);
    }
    // A dashboard hostname is not a storefront. Ten modules resolve a tenant
    // through this use-case; without this guard an admin host would read as a
    // valid storefront everywhere from checkout to legal documents.
    if (cached === null || cached.kind !== 'storefront') {
      throw new UnknownTenantHost(hostname);
    }
    const tenantId = cached.tenantId;

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      // Stale cache entry pointing at a deleted tenant — evict and 404.
      await this.cache.invalidateHost(hostname);
      throw new UnknownTenantHost(hostname);
    }

    const selection = await this.currentSubscriptions.findByTenant(tenantId);
    const evaluation = evaluateSubscription(
      selection.current?.subscription ?? null,
      selection.evaluatedAt,
    );
    const live =
      tenant.status === 'active' && evaluation.storefrontLive && tenant.legalReadyAt !== null;
    return toPublicTenantResponse(tenant, live);
  }
}
