import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicTenantResponse } from '@booking/shared';
import { normalizeHostname } from '../../domain/hostname';
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
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
} from '../../domain/ports/subscription-repository.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';
import { toPublicTenantResponse } from '../tenancy.mapper';

/**
 * Resolves a storefront Host header to its tenant (§6.1). Runs on the admin
 * pool (no tenant context exists yet — this IS the resolution). The host→tenant
 * mapping is cached in Redis (60s, negative caching for unknown hosts); the
 * `live` flag is computed fresh each call from tenant status + subscription so
 * an expiry takes effect immediately (§6.5).
 */
@Injectable()
export class ResolveTenantByHostUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(rawHost: string, now = new Date()): Promise<PublicTenantResponse> {
    const hostname = normalizeHostname(rawHost);

    let tenantId = await this.cache.getHost(hostname);
    if (tenantId === undefined) {
      const domain = await this.domains.findByHostname(hostname);
      // Only a verified domain resolves — an unverified custom domain isn't live.
      tenantId = domain && domain.verifiedAt ? domain.tenantId : null;
      await this.cache.setHost(hostname, tenantId);
    }
    if (tenantId === null) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'UNKNOWN_HOST',
        message: `No tenant mapped to host "${hostname}"`,
      });
    }

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      // Stale cache entry pointing at a deleted tenant — evict and 404.
      await this.cache.invalidateHost(hostname);
      throw new NotFoundException({
        statusCode: 404,
        code: 'UNKNOWN_HOST',
        message: `No tenant mapped to host "${hostname}"`,
      });
    }

    const sub = await this.subscriptions.findCurrentByTenant(tenantId);
    const evaluation = evaluateSubscription(sub, now);
    const live = tenant.status === 'active' && evaluation.storefrontLive;
    return toPublicTenantResponse(tenant, live);
  }
}
