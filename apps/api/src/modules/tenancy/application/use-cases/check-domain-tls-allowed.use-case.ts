import { Inject, Injectable } from '@nestjs/common';
import { normalizeHostname } from '../../../../shared/http/hostname';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';

/**
 * Caddy's on-demand-TLS `ask` gate (§6.1). Caddy calls this *during the TLS
 * handshake* for a hostname it has never seen; a yes makes it go and obtain a
 * Let's Encrypt certificate. It is therefore the only thing standing between a
 * stranger pointing any domain at our Elastic IP and us issuing certificates on
 * their behalf — which is also how the account hits the ACME rate limit.
 *
 * The answer is exactly the rule the storefront already lives by: only a
 * *verified* row in `tenant_domains` resolves. Shares the 60s Redis host cache
 * (negative caching included) with {@link ResolveTenantByHostUseCase} rather
 * than querying per handshake, and touches no schema.
 */
@Injectable()
export class CheckDomainTlsAllowedUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(rawHost: string): Promise<boolean> {
    const hostname = normalizeHostname(rawHost);
    // An unparseable Host is never a tenant — fail closed without a lookup.
    if (!hostname) return false;

    let cached = await this.cache.getHost(hostname);
    if (cached === undefined) {
      const domain = await this.domains.findByHostname(hostname);
      cached = domain && domain.verifiedAt
        ? { tenantId: domain.tenantId, kind: domain.kind }
        : null;
      await this.cache.setHost(hostname, cached);
    }
    // Kind-agnostic on purpose: a verified dashboard host needs a certificate
    // exactly as much as a storefront one.
    return cached !== null;
  }
}
