import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { domainVerificationRecord } from '../../domain/hostname';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';
import { DNS_VERIFIER, type IDnsVerifier } from '../../domain/ports/dns-verifier.port';
import { TENANT_CACHE, type ITenantCache } from '../../domain/ports/tenant-cache.port';

/**
 * Confirms custom-domain ownership by checking the published TXT record (§6.1).
 * On success the domain is marked verified and its host cache entry evicted so
 * the next storefront request resolves the freshly-live tenant.
 */
@Injectable()
export class VerifyDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(DNS_VERIFIER) private readonly dns: IDnsVerifier,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  async execute(tenantId: string, domainId: string): Promise<DomainRecord> {
    const domain = await this.domains.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain ${domainId} not found for this tenant`,
      });
    }
    if (domain.verifiedAt) return domain;
    if (!domain.verificationToken) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'DOMAIN_NOT_VERIFIABLE',
        message: 'Domain has no verification token',
      });
    }

    const record = domainVerificationRecord(domain.hostname, domain.verificationToken);
    const ok = await this.dns.hasTxtRecord(record.name, record.value);
    if (!ok) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'DOMAIN_VERIFICATION_FAILED',
        message: `TXT record ${record.name} not found or does not match`,
      });
    }
    const verified = await this.domains.markVerified(domain.id);
    await this.cache.invalidateHost(domain.hostname);
    return verified;
  }
}
