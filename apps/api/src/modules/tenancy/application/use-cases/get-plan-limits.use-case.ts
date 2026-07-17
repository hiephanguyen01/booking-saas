import { Inject, Injectable } from '@nestjs/common';
import type { PlanLimits } from '@booking/contracts';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
} from '../../domain/ports/subscription-repository.port';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';

/**
 * Looks up the active plan's limits (subscription_plans.limits, §6.5) for a
 * tenant. Runs on the admin pool via the repositories (the plan lives on
 * tenant-level tables); the assert- and quota use-cases compose this lookup.
 */
@Injectable()
export class GetPlanLimitsUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  /** The active plan's limits, or null when the tenant has no assigned plan. */
  async execute(tenantId: string): Promise<PlanLimits | null> {
    const sub = await this.subscriptions.findCurrentByTenant(tenantId);
    if (!sub) return null;
    const plan = await this.plans.findById(sub.planId);
    return plan?.limits ?? null;
  }
}
