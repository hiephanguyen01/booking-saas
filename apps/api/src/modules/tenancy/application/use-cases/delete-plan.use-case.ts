import { Inject, Injectable } from '@nestjs/common';
import { SubscriptionPlan } from '../../domain/entities/subscription-plan.entity';
import { PlanNotFound } from '../../domain/errors/billing-errors';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';

/**
 * Deletes a subscription plan (§19) — the escape hatch for a plan created by
 * mistake, since `name` is UNIQUE and would otherwise stay burned forever.
 *
 * Deleting is only ever allowed for a plan nothing references:
 *  - **live subscribers** → 409 `PLAN_HAS_SUBSCRIBERS`. Dropping the plan out from
 *    under a paying tenant would strip its limits and its price.
 *  - **historical subscriptions only** → 409 `PLAN_HAS_SUBSCRIPTION_HISTORY`. The
 *    plan FK is RESTRICT, so the row physically cannot be removed without taking
 *    the billing history with it; deactivating (`PATCH { isActive: false }`) is the
 *    correct move and keeps the trail intact.
 *
 * Both are checked in the application layer so the caller gets an actionable 409
 * instead of a leaked Prisma foreign-key error.
 */
@Injectable()
export class DeletePlanUseCase {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(id: string): Promise<void> {
    const plan = await this.plans.findById(id);
    if (!plan) {
      throw new PlanNotFound(id);
    }

    const [liveCounts, totalSubscriptions] = await Promise.all([
      this.plans.liveSubscriberCounts(),
      this.plans.countSubscriptions(id),
    ]);

    const live = liveCounts.get(id) ?? 0;
    // live subscribers first, subscription history second (see assertDeletable).
    SubscriptionPlan.rehydrate(plan).assertDeletable(live, totalSubscriptions);

    await this.plans.delete(id);
  }
}
