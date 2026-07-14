import { randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AddDomainInput } from '@booking/contracts';
import { normalizeHostname } from '../../domain/hostname';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
  type DomainRecord,
} from '../../domain/ports/tenant-domain-repository.port';
import { PlanLimitService } from '../services/plan-limit.service';

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
    private readonly planLimits: PlanLimitService,
  ) {}

  async execute(tenantId: string, input: AddDomainInput): Promise<DomainRecord> {
    if (!(await this.tenants.findById(tenantId))) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} not found`,
      });
    }
    await this.planLimits.assertCustomDomainAllowed(tenantId);

    const hostname = normalizeHostname(input.hostname);
    if (await this.domains.findByHostname(hostname)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'DOMAIN_TAKEN',
        message: `Hostname "${hostname}" is already mapped`,
      });
    }
    return this.domains.create({
      tenantId,
      hostname,
      isPrimary: input.isPrimary,
      verificationToken: `bookify-verify=${randomBytes(16).toString('hex')}`,
      verifiedAt: null,
    });
  }
}
