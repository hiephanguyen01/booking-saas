import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AddDomainInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { DomainTaken } from '../../domain/errors/tenancy-errors';
import { TenantDomain } from '../../domain/entities/tenant-domain.entity';
import { normalizeHostname } from '../../../../shared/http/hostname';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';
import { AssertCustomDomainAllowedUseCase } from './assert-custom-domain-allowed.use-case';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';

/**
 * Maps a custom domain to a tenant (§6.1). Gated by the plan's `customDomain`
 * flag; the domain starts unverified with a TXT token the tenant must publish,
 * then confirmed via VerifyDomainUseCase.
 */
@Injectable()
export class AddDomainUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
    private readonly assertCustomDomainAllowed: AssertCustomDomainAllowedUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, input: AddDomainInput): Promise<DomainRecord> {
    if (!(await this.tenants.findById(tenantId))) {
      throw new TenantNotFound();
    }
    await this.assertCustomDomainAllowed.execute(tenantId);

    const hostname = normalizeHostname(input.hostname);
    if (await this.domains.findByHostname(hostname)) {
      throw new DomainTaken(hostname);
    }
    const requested = TenantDomain.requestCustomDomain({
      tenantId,
      hostname,
      isPrimary: input.isPrimary,
      randomHex: randomBytes(16).toString('hex'),
    });
    const created = await this.tenantDb.forTenant(tenantId, async (tx) => {
      // Insert non-primary first so the partial unique index remains valid
      // throughout a primary swap. The repository performs clear-old/set-new
      // in this same transaction.
      const domain = await this.domains.create(
        input.isPrimary ? { ...requested, isPrimary: false } : requested,
        tx,
      );
      return input.isPrimary ? this.domains.setPrimary(tenantId, domain.id, tx) : domain;
    });
    await this.cache.invalidateHost(hostname);
    return created;
  }
}
