import { Inject, Injectable } from '@nestjs/common';
import {
  PLAN_REPOSITORY,
  type IPlanRepository,
  type PlanWithSubscribers,
} from '../../domain/ports/plan-repository.port';

/**
 * The admin plan list, each plan carrying the live subscriber count its MRR is
 * derived from. Two queries total regardless of plan count — the counts arrive as
 * one grouped aggregate, not one query per plan.
 */
@Injectable()
export class ListPlansUseCase {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(): Promise<PlanWithSubscribers[]> {
    const [plans, counts] = await Promise.all([
      this.plans.list(),
      this.plans.liveSubscriberCounts(),
    ]);
    return plans.map((plan) => ({ plan, subscriberCount: counts.get(plan.id) ?? 0 }));
  }
}
