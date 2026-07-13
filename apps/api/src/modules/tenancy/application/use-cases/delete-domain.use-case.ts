import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/ports/tenant-domain-repository.port';

/**
 * Removes a tenant's custom-domain mapping (§6.1). Ownership is enforced by
 * matching the domain's `tenantId` to the caller's scope — a mismatch (or a
 * missing id) resolves to 404. A verified primary domain can't be removed while
 * it's the only verified domain, to avoid orphaning the live storefront.
 */
@Injectable()
export class DeleteDomainUseCase {
  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const domain = await this.domains.findById(id);
    if (!domain || domain.tenantId !== tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'DOMAIN_NOT_FOUND',
        message: 'Domain not found',
      });
    }
    if (domain.isPrimary && domain.verifiedAt) {
      const others = (await this.domains.listByTenant(tenantId)).filter(
        (d) => d.id !== id && d.verifiedAt,
      );
      if (others.length === 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'DOMAIN_PRIMARY_REQUIRED',
          message: 'Cannot remove the only verified primary domain',
        });
      }
    }
    await this.domains.delete(id);
  }
}
