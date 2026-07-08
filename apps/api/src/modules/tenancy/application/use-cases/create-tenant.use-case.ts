import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreateTenantInput } from '@booking/shared';
import { buildDefaultSubdomain } from '../../domain/hostname';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config';

/**
 * Platform admin creates a tenant (§21 Phase 1 — manual, no self-serve). The
 * default `<slug>.<baseDomain>` subdomain is provisioned as the verified
 * primary domain in the same operation.
 */
@Injectable()
export class CreateTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
    @Inject(TENANCY_CONFIG) private readonly config: TenancyConfig,
  ) {}

  async execute(input: CreateTenantInput): Promise<{ tenant: TenantRecord; primaryDomain: DomainRecord }> {
    if (await this.tenants.findBySlug(input.slug)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'TENANT_SLUG_TAKEN',
        message: `Slug "${input.slug}" is already in use`,
      });
    }
    const subdomain = buildDefaultSubdomain(input.slug, this.config.baseDomain);
    if (await this.domains.findByHostname(subdomain)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'DOMAIN_TAKEN',
        message: `Hostname "${subdomain}" is already mapped`,
      });
    }

    const tenant = await this.tenants.create({
      name: input.name,
      slug: input.slug,
      vertical: input.vertical,
      defaultTimezone: input.defaultTimezone,
      defaultLocale: input.defaultLocale,
    });
    // The default subdomain is trusted (we own the base domain) → verified now.
    const primaryDomain = await this.domains.create({
      tenantId: tenant.id,
      hostname: subdomain,
      isPrimary: true,
      verificationToken: null,
      verifiedAt: new Date(),
    });
    await this.cache.invalidateHost(subdomain);
    return { tenant, primaryDomain };
  }
}
