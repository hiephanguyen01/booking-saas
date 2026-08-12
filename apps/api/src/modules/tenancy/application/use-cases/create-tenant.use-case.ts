import { Inject, Injectable } from '@nestjs/common';
import type { CreateTenantInput } from '@booking/contracts';
import { buildDefaultAdminSubdomain, buildDefaultSubdomain } from '../../domain/hostname';
import { TenantDomain } from '../../domain/entities/tenant-domain.entity';
import { DomainTaken, TenantSlugTaken } from '../../domain/errors/tenancy-errors';
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
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';

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
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    input: CreateTenantInput,
  ): Promise<{ tenant: TenantRecord; primaryDomain: DomainRecord }> {
    if (await this.tenants.findBySlug(input.slug)) {
      throw new TenantSlugTaken(input.slug);
    }
    const subdomain = buildDefaultSubdomain(input.slug, this.config.baseDomain);
    const adminSubdomain = buildDefaultAdminSubdomain(input.slug, this.config.baseDomain);
    for (const hostname of [subdomain, adminSubdomain]) {
      if (await this.domains.findByHostname(hostname)) {
        throw new DomainTaken(hostname);
      }
    }

    // Tenant + its primary domain commit in ONE admin-pool transaction: a failure
    // provisioning the domain must not leave an orphaned tenant row behind.
    const { tenant, primaryDomain } = await this.tenants.runInTransaction(async (tx) => {
      const tenant = await this.tenants.create(
        {
          name: input.name,
          slug: input.slug,
          vertical: input.vertical,
          defaultTimezone: input.defaultTimezone,
          defaultLocale: input.defaultLocale,
        },
        tx,
      );
      // The default subdomain is trusted (we own the base domain) → verified now.
      const primaryDomain = await this.domains.create(
        TenantDomain.provisionDefaultSubdomain({
          tenantId: tenant.id,
          hostname: subdomain,
          kind: 'storefront',
          now: new Date(),
        }),
        tx,
      );
      // The console host is provisioned with the tenant, not sold as an add-on:
      // /tenant and /partner exist only on a tenant host, so a tenant without one
      // would have no way in at all.
      await this.domains.create(
        TenantDomain.provisionDefaultSubdomain({
          tenantId: tenant.id,
          hostname: adminSubdomain,
          kind: 'dashboard',
          now: new Date(),
        }),
        tx,
      );
      await this.outbox.emit(tx, {
        tenantId: tenant.id,
        eventType: 'tenant.created',
        payload: { tenantId: tenant.id },
      });
      return { tenant, primaryDomain };
    });
    await this.cache.invalidateHost(subdomain);
    await this.cache.invalidateHost(adminSubdomain);
    return { tenant, primaryDomain };
  }
}
