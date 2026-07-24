import type { CanActivate } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../../tenancy/domain/ports/tenant-repository.port';
import { PartnerPromotionsDisabled } from '../../../application/promotion-http-errors';

/**
 * Gates the partner promotions surface behind a per-tenant toggle (§12.2 — the
 * tenant decides whether partners may create their own codes). Reads
 * `settings.partnerPromotionsEnabled`; defaults to disabled. Runs after
 * PermissionsGuard has seeded the partner/tenant context.
 */
@Injectable()
export class PartnerPromotionsEnabledGuard implements CanActivate {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(): Promise<boolean> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const tenant = await this.tenants.findById(tenantId);
    if (tenant?.settings?.partnerPromotionsEnabled !== true) {
      throw new PartnerPromotionsDisabled();
    }
    return true;
  }
}
