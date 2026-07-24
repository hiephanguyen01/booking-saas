import { Inject, Injectable } from '@nestjs/common';
import {
  PLAN_REPOSITORY,
  type IPlanRepository,
  type PlanWithSubscribers,
} from '../../domain/ports/plan-repository.port';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';

/**
 * The admin plan list, each plan carrying the live subscriber count its MRR is
 * derived from. Two queries total regardless of plan count — the counts arrive as
 * one grouped aggregate, not one query per plan.
 */
@Injectable()
export class ListPlansUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
  ) {}

  async execute(): Promise<PlanWithSubscribers[]> {
    const [plans, counts] = await Promise.all([
      this.plans.list(),
      this.currentSubscriptions.liveSubscriberCounts(),
    ]);
    return plans.map((plan) => ({ plan, subscriberCount: counts.get(plan.id) ?? 0 }));
  }
}
