import { Inject, Injectable } from '@nestjs/common';
import type { PlanLimits } from '@booking/contracts';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';
import { evaluateSubscription } from '../../domain/subscription-status';

/**
 * Looks up the active plan's limits (subscription_plans.limits, §6.5) for a
 * tenant. Runs on the admin pool via the repositories (the plan lives on
 * tenant-level tables); the assert- and quota use-cases compose this lookup.
 */
@Injectable()
export class GetPlanLimitsUseCase {
  constructor(
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
  ) {}

  /** The active plan's limits, or null when the tenant has no assigned plan. */
  async execute(tenantId: string): Promise<PlanLimits | null> {
    const selection = await this.currentSubscriptions.findByTenant(tenantId);
    if (
      !selection.current ||
      evaluateSubscription(selection.current.subscription, selection.evaluatedAt).phase !== 'active'
    ) {
      return null;
    }
    return selection.current.plan.limits;
  }
}
