import { ForbiddenException } from '@nestjs/common';
import type { PlanLimits } from '@booking/contracts';

/**
 * Shared plan-limit failures (§6.5) — plain functions (not injectables) so the
 * assert use-cases throw identical error shapes without duplicating them.
 */

/** Narrows a nullable limits lookup, failing closed when no plan is assigned. */
export function requirePlanLimits(limits: PlanLimits | null): PlanLimits {
  if (!limits) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'NO_ACTIVE_PLAN',
      message: 'Tenant has no active subscription plan',
    });
  }
  return limits;
}

export function planLimitReached(key: string, limit: number): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'PLAN_LIMIT_REACHED',
    message: `Plan limit reached for ${key} (max ${limit})`,
  });
}
