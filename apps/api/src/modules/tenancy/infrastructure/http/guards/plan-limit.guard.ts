import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import { AssertCanAddPartnerUseCase } from '../../../application/use-cases/assert-can-add-partner.use-case';
import { AssertCanAddListingUseCase } from '../../../application/use-cases/assert-can-add-listing.use-case';
import { PLAN_LIMIT_RESOURCE, type PlanLimitResource } from '../decorators/enforce-plan-limit.decorator';

/**
 * Blocks a create when the tenant's plan hard-limit is reached (§6.5). Applied
 * per-route with `@UseGuards(PlanLimitGuard)` + `@EnforcePlanLimit('partner')`;
 * runs after the global PermissionsGuard has seeded the tenant context.
 */
@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly assertCanAddPartner: AssertCanAddPartnerUseCase,
    private readonly assertCanAddListing: AssertCanAddListingUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<PlanLimitResource>(PLAN_LIMIT_RESOURCE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!resource) return true;

    const tenantId = this.tenantContext.tenantIdOrThrow();
    if (resource === 'partner') {
      await this.assertCanAddPartner.execute(tenantId);
    } else {
      await this.assertCanAddListing.execute(tenantId);
    }
    return true;
  }
}
