import { Inject, Injectable } from '@nestjs/common';
import type { SlugAvailabilityResponse } from '@booking/contracts';
import {
  buildDefaultAdminSubdomain,
  buildDefaultSubdomain,
  isAdminHostname,
} from '../../domain/hostname';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config.port';

/**
 * Pre-flight for the create-tenant form: is this slug usable?
 *
 * Runs the same four checks {@link CreateTenantUseCase} enforces, in the same
 * precedence order — the slug itself, the reserved `admin` prefix (a slug of
 * literally "admin" would provision a storefront subdomain indistinguishable
 * from the platform's own console host), the `<slug>.<baseDomain>` storefront
 * subdomain, and the `admin.<slug>.<baseDomain>` console subdomain it would
 * also provision — so "available" here means create will not 4xx on the slug.
 * The domain checks are separate from the slug check because a subdomain can
 * be taken by a *custom* domain even when no tenant holds the slug.
 *
 * Advisory only: this is not a reservation, and create remains the authority (it
 * re-checks and races are settled by the unique constraints).
 */
@Injectable()
export class CheckSlugAvailabilityUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(TENANCY_CONFIG) private readonly config: TenancyConfig,
  ) {}

  async execute(slug: string): Promise<SlugAvailabilityResponse> {
    const subdomain = buildDefaultSubdomain(slug, this.config.baseDomain);
    const adminSubdomain = buildDefaultAdminSubdomain(slug, this.config.baseDomain);
    const base = { slug, subdomain, baseDomain: this.config.baseDomain };

    const [tenant, domain, adminDomain] = await Promise.all([
      this.tenants.findBySlug(slug),
      this.domains.findByHostname(subdomain),
      this.domains.findByHostname(adminSubdomain),
    ]);

    if (tenant) return { ...base, available: false, reason: 'slug_taken' };
    if (isAdminHostname(subdomain)) {
      return { ...base, available: false, reason: 'admin_prefix_reserved' };
    }
    if (domain) return { ...base, available: false, reason: 'domain_taken' };
    if (adminDomain) return { ...base, available: false, reason: 'admin_domain_taken' };
    return { ...base, available: true, reason: null };
  }
}
