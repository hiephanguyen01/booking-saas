import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import { checkHardLimit } from '../../domain/plan-limits';
import { planLimitReached, requirePlanLimits } from '../plan-limit-errors';
import { GetPlanLimitsUseCase } from './get-plan-limits.use-case';

/**
 * Hard listing cap (§6.5): throws PLAN_LIMIT_REACHED before a listing create
 * once the tenant's plan `maxListings` is used up. Backs PlanLimitGuard.
 */
@Injectable()
export class AssertCanAddListingUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly getPlanLimits: GetPlanLimitsUseCase,
  ) {}

  async execute(tenantId: string): Promise<void> {
    const limits = requirePlanLimits(await this.getPlanLimits.execute(tenantId));
    const current = await this.tenants.countListings(tenantId);
    if (!checkHardLimit(current, limits.maxListings).allowed) {
      throw planLimitReached('maxListings', limits.maxListings);
    }
  }
}
