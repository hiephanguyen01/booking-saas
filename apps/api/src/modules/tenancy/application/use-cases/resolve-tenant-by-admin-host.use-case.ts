import { Inject, Injectable } from '@nestjs/common';
import { dashboardBrandConfigSchema, type DashboardBrandConfig } from '@booking/contracts';
import { normalizeHostname } from '../../../../shared/http/hostname';
import { evaluateSubscription } from '../../domain/subscription-status';
import { TENANT_REPOSITORY, type ITenantRepository } from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';
import { UnknownTenantHost } from '../../domain/errors/tenancy-errors';

export interface AdminHostTenant {
  id: string;
  name: string;
  slug: string;
  branding: DashboardBrandConfig | null;
  /** Renders a renewal banner. It does NOT lock the console — see below. */
  subscriptionExpired: boolean;
  /** True when the tenant row is suspended; the BFF turns this into a 403 page. */
  suspended: boolean;
}

/**
 * Resolves a dashboard Host header to its tenant. The mirror image of
 * {@link ResolveTenantByHostUseCase}, filtered to `kind='dashboard'` and sharing
 * its Redis host cache.
 *
 * Deliberately does NOT apply the storefront's `live` rule. A tenant whose
 * subscription has lapsed must still reach the console — that is where they
 * renew, and locking them out of it is the one failure mode that cannot be
 * recovered from in-product. An expired subscription is reported so the shell can
 * show a banner.
 *
 * A suspended tenant is reported too rather than 404'd. The caller already knows
 * this hostname exists — they typed it — so answering "not found" only makes a
 * deliberate suspension look like a broken domain, and the operator has no way to
 * tell the difference. The BFF renders it as an explicit 403.
 */
@Injectable()
export class ResolveTenantByAdminHostUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(rawHost: string): Promise<AdminHostTenant> {
    const hostname = normalizeHostname(rawHost);
    if (!hostname) throw new UnknownTenantHost(rawHost);

    const cached = await this.cache.resolveHost(hostname, async (name) => {
      const domain = await this.domains.findByHostname(name);
      // Only a verified domain resolves — an unverified custom domain isn't live.
      return domain && domain.verifiedAt
        ? { tenantId: domain.tenantId, kind: domain.kind }
        : null;
    });
    if (cached === null || cached.kind !== 'dashboard') {
      throw new UnknownTenantHost(hostname);
    }

    const tenant = await this.tenants.findById(cached.tenantId);
    if (!tenant) {
      await this.cache.invalidateHost(hostname);
      throw new UnknownTenantHost(hostname);
    }

    const selection = await this.currentSubscriptions.findByTenant(tenant.id);
    const evaluation = evaluateSubscription(
      selection.current?.subscription ?? null,
      selection.evaluatedAt,
    );
    const branding = dashboardBrandConfigSchema.safeParse(tenant.themeConfig);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      branding: branding.success ? branding.data : null,
      subscriptionExpired: !evaluation.dashboardWritable,
      // `=== 'suspended'`, NOT `!== 'active'`. TenantStatus is active | suspended
      // | expired, so the negative test would lock out the `expired` tenant this
      // whole rule exists to keep in — the one who most needs to reach the
      // renewal screen. Only a suspension is a platform decision the tenant
      // cannot undo, and only it earns a closed door.
      suspended: tenant.status === 'suspended',
    };
  }
}
