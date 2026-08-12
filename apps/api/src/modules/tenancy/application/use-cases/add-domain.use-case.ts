import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AddDomainInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import {
  AdminDomainPrefixRequired,
  AdminPrefixReserved,
  DomainNotVerified,
  DomainTaken,
} from '../../domain/errors/tenancy-errors';
import { TenantDomain } from '../../domain/entities/tenant-domain.entity';
import { isAdminHostname } from '../../domain/hostname';
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
    // A freshly requested custom domain is always born unverified (see
    // TenantDomain.requestCustomDomain below), so it can never legitimately
    // become primary at creation. SetPrimaryDomainUseCase is the only path
    // that may promote a domain, and it always calls
    // TenantDomain.assertCanBecomePrimary() first — this was the second,
    // unguarded write path straight to the repository. Refuse rather than
    // silently drop the flag: a silent no-op would leave the tenant believing
    // they set it, and the domain still can't be verified from behind an
    // already-primary row it just demoted.
    if (input.isPrimary) {
      throw new DomainNotVerified();
    }
    await this.assertCustomDomainAllowed.execute(tenantId);

    const hostname = normalizeHostname(input.hostname);

    // Symmetric rules. Without the second one a storefront host could claim
    // `admin.…` and Caddy would route real shop traffic to the console.
    const adminHost = isAdminHostname(hostname);
    if (input.kind === 'dashboard' && !adminHost) {
      throw new AdminDomainPrefixRequired(hostname);
    }
    if (input.kind === 'storefront' && adminHost) {
      throw new AdminPrefixReserved(hostname);
    }

    if (await this.domains.findByHostname(hostname)) {
      throw new DomainTaken(hostname);
    }
    // `isPrimary` is always false here (the guard above throws otherwise), so
    // there is no primary-swap to perform — just insert the requested row.
    const requested = TenantDomain.requestCustomDomain({
      tenantId,
      hostname,
      isPrimary: false,
      kind: input.kind,
      randomHex: randomBytes(16).toString('hex'),
    });
    const created = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.domains.create(requested, tx),
    );
    await this.cache.invalidateHost(hostname);
    return created;
  }
}
