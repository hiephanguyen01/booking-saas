import { Inject, Injectable } from '@nestjs/common';
import type { SlugAvailabilityResponse } from '@booking/contracts';
import { buildDefaultSubdomain } from '../../domain/hostname';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config';

/**
 * Pre-flight for the create-tenant form: is this slug usable?
 *
 * Runs the exact two checks {@link CreateTenantUseCase} enforces — the slug itself
 * and the `<slug>.<baseDomain>` subdomain it would provision — so "available" here
 * means create will not 409 on the slug. The two are separate because a subdomain
 * can be taken by a *custom* domain even when no tenant holds the slug.
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
    const base = { slug, subdomain, baseDomain: this.config.baseDomain };

    const [tenant, domain] = await Promise.all([
      this.tenants.findBySlug(slug),
      this.domains.findByHostname(subdomain),
    ]);

    if (tenant) return { ...base, available: false, reason: 'slug_taken' };
    if (domain) return { ...base, available: false, reason: 'domain_taken' };
    return { ...base, available: true, reason: null };
  }
}
