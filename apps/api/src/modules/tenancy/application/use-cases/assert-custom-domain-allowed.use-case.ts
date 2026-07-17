import { ForbiddenException, Injectable } from '@nestjs/common';
import { isModuleEnabled } from '../../domain/plan-limits';
import { requirePlanLimits } from '../plan-limit-errors';
import { GetPlanLimitsUseCase } from './get-plan-limits.use-case';

/**
 * Plan feature gate for custom domains (§6.5): throws PLAN_FEATURE_DISABLED
 * unless the active plan's `customDomain` flag is on.
 */
@Injectable()
export class AssertCustomDomainAllowedUseCase {
  constructor(private readonly getPlanLimits: GetPlanLimitsUseCase) {}

  async execute(tenantId: string): Promise<void> {
    const limits = requirePlanLimits(await this.getPlanLimits.execute(tenantId));
    if (!isModuleEnabled(limits, 'customDomain')) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_FEATURE_DISABLED',
        message: 'The current plan does not include custom domains',
      });
    }
  }
}
