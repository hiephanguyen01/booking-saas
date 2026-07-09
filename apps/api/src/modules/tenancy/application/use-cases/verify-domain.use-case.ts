import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';
import {
  DOMAIN_VERIFICATION_QUEUE,
  type IDomainVerificationQueue,
} from '../../domain/ports/domain-verification-queue.port';

export interface VerifyDomainResult {
  status: 'verified' | 'checking';
  domain: DomainRecord;
}

/**
 * Triggers custom-domain verification (§6.1). Validates the request cheaply, then
 * hands the actual TXT lookup to a background worker (a slow resolver must not
 * block the request) and returns `checking`; the worker sets `verified_at` and
 * evicts the host cache once the record resolves. An already-verified domain
 * short-circuits to `verified`. This is also the manual "check now" affordance.
 */
@Injectable()
export class VerifyDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(DOMAIN_VERIFICATION_QUEUE) private readonly queue: IDomainVerificationQueue,
  ) {}

  async execute(tenantId: string, domainId: string): Promise<VerifyDomainResult> {
    const domain = await this.domains.findById(domainId);
    if (!domain || domain.tenantId !== tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain ${domainId} not found for this tenant`,
      });
    }
    if (domain.verifiedAt) return { status: 'verified', domain };
    if (!domain.verificationToken) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'DOMAIN_NOT_VERIFIABLE',
        message: 'Domain has no verification token',
      });
    }

    await this.queue.enqueue(tenantId, domainId);
    return { status: 'checking', domain };
  }
}
