import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
  type SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';
import {
  PLAN_REPOSITORY,
  type IPlanRepository,
  type PlanWithSubscribers,
} from '../../domain/ports/plan-repository.port';

/**
 * Platform admin reads a tenant's current subscription (the latest by startsAt)
 * together with its plan, for the tenant detail screen (Task 1.12). Returns null
 * when the tenant has never been subscribed.
 */
@Injectable()
export class GetCurrentSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
  ) {}

  async execute(
    tenantId: string,
  ): Promise<{ subscription: SubscriptionRecord; plan: PlanWithSubscribers | null } | null> {
    const subscription = await this.subscriptions.findCurrentByTenant(tenantId);
    if (!subscription) return null;
    const [plan, counts] = await Promise.all([
      this.plans.findById(subscription.planId),
      this.plans.liveSubscriberCounts(),
    ]);
    return {
      subscription,
      plan: plan ? { plan, subscriberCount: counts.get(plan.id) ?? 0 } : null,
    };
  }
}
