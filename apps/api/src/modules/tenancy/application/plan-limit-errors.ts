import type { PlanLimits } from '@booking/contracts';
import { NoActivePlan, PlanLimitReached } from '../domain/errors/billing-errors';

/**
 * Shared plan-limit failures (§6.5) — plain functions (not injectables) so the
 * assert use-cases throw identical error shapes without duplicating them.
 */

/** Narrows a nullable limits lookup, failing closed when no plan is assigned. */
export function requirePlanLimits(limits: PlanLimits | null): PlanLimits {
  if (!limits) {
    throw new NoActivePlan();
  }
  return limits;
}

export function planLimitReached(key: string, limit: number): PlanLimitReached {
  return new PlanLimitReached(key, limit);
}
