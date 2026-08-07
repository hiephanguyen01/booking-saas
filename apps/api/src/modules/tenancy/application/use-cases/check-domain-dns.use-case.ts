import { Inject, Injectable } from '@nestjs/common';
import { utcNow } from '../../../../shared/time/time';
import { DomainNotFoundForTenant } from '../../domain/errors/tenancy-errors';
import { DNS_VERIFIER, type IDnsVerifier } from '../../domain/ports/dns-verifier.port';
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';

/** Compare a configured target the way the adapter reports what DNS answered. */
function normalizeTarget(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export interface DomainDnsCheck {
  pointsToUs: boolean;
  observedCname: string | null;
  observedIpv4: string[];
  checkedAt: Date;
}

/**
 * Answers "has this domain been pointed at us yet?" (§6.1). TXT verification
 * proves *ownership* and is what gates certificate issuance; it does nothing to
 * make the hostname serve traffic. Without this, a tenant sees "Đã xác minh" and
 * a blank page, with nothing in the dashboard explaining the gap.
 *
 * Runs inline and stores nothing: it is a button the tenant presses, not a
 * condition anything depends on — unlike TXT verification, which must run in the
 * background because a domain is not live until it passes. Nothing here is
 * cached either, so the answer reflects DNS at the moment of the click.
 */
@Injectable()
export class CheckDomainDnsUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(DNS_VERIFIER) private readonly dns: IDnsVerifier,
    @Inject(TENANCY_CONFIG) private readonly config: TenancyConfig,
  ) {}

  async execute(tenantId: string, domainId: string): Promise<DomainDnsCheck> {
    const domain = await this.domains.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      throw new DomainNotFoundForTenant(domainId);
    }

    const [observedCname, observedIpv4] = await Promise.all([
      this.dns.resolveCname(domain.hostname),
      this.dns.resolveIpv4(domain.hostname),
    ]);

    // Both supported shapes count. The A check is the stronger one — it follows
    // the CNAME chain, so it proves the record actually lands on us rather than
    // merely being spelled right. The CNAME check is kept as well so a correct
    // setup still reads as correct when the chain's A lookup is momentarily
    // unavailable, or when the platform has published no IPv4 at all.
    const cnameMatches =
      normalizeTarget(this.config.storefrontCname) !== '' &&
      observedCname === normalizeTarget(this.config.storefrontCname);
    const ipv4Matches =
      this.config.storefrontIpv4 !== '' && observedIpv4.includes(this.config.storefrontIpv4);

    return {
      pointsToUs: cnameMatches || ipv4Matches,
      observedCname,
      observedIpv4,
      checkedAt: utcNow(),
    };
  }
}
