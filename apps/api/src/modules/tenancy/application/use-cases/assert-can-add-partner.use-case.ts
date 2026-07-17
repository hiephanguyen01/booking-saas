import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import { checkHardLimit } from '../../domain/plan-limits';
import { planLimitReached, requirePlanLimits } from '../plan-limit-errors';
import { GetPlanLimitsUseCase } from './get-plan-limits.use-case';

/**
 * Hard partner cap (§6.5): throws PLAN_LIMIT_REACHED before a partner create
 * once the tenant's plan `maxPartners` is used up. Backs PlanLimitGuard and
 * the partner application flow.
 */
@Injectable()
export class AssertCanAddPartnerUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly getPlanLimits: GetPlanLimitsUseCase,
  ) {}

  async execute(tenantId: string): Promise<void> {
    const limits = requirePlanLimits(await this.getPlanLimits.execute(tenantId));
    const current = await this.tenants.countPartners(tenantId);
    if (!checkHardLimit(current, limits.maxPartners).allowed) {
      throw planLimitReached('maxPartners', limits.maxPartners);
    }
  }
}
