import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePlanInput } from '@booking/contracts';
import { SubscriptionPlan } from '../../domain/entities/subscription-plan.entity';
import { PlanNameTaken, PlanNotFound } from '../../domain/errors/billing-errors';
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
 * Edits a subscription plan (§19). Exists because `subscription_plans.name` is
 * UNIQUE: without an update path a mistyped price is permanent, since the plan can
 * be neither corrected nor recreated under the same name.
 *
 * **Does a price edit re-price existing subscribers?** Yes — unavoidably.
 * `tenant_subscriptions` holds only `plan_id` and reads `price_monthly` through
 * that FK; there is no price snapshot column, so every consumer of a subscription's
 * price resolves it live from the plan. "Apply to new subscriptions only" is
 * therefore not expressible against this schema (it would need a snapshot column,
 * i.e. a migration).
 *
 * Given that, the non-surprising behaviour is to make the blast radius explicit
 * rather than silent: a price change on a plan with live subscribers is refused
 * (409 `PLAN_HAS_SUBSCRIBERS`, naming the count) unless the caller passes
 * `repriceExistingSubscribers: true`. The common case — fixing a typo on a plan
 * nobody has bought yet — needs no flag and just works.
 *
 * `limits` and `isActive` are intentionally *not* gated: limits are the plan's
 * current caps and are meant to track the plan, and `isActive` only hides a plan
 * from new assignment (it never disturbs an existing subscriber).
 */
@Injectable()
export class UpdatePlanUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
  ) {}

  async execute(id: string, input: UpdatePlanInput): Promise<PlanWithSubscribers> {
    const plan = await this.plans.findById(id);
    if (!plan) {
      throw new PlanNotFound(id);
    }

    // Checked up-front so the UNIQUE violation never escapes as a Prisma error.
    if (input.name !== undefined && input.name !== plan.name) {
      const clash = await this.plans.findByName(input.name);
      if (clash) {
        throw new PlanNameTaken(input.name);
      }
    }

    // Money is parsed with BigInt, never Number — a VND price can exceed 2^53.
    const priceMonthly = input.priceMonthly === undefined ? undefined : BigInt(input.priceMonthly);
    const subscriberCount = (await this.currentSubscriptions.liveSubscriberCounts()).get(id) ?? 0;

    // The repricing gate (409 PLAN_HAS_SUBSCRIBERS unless confirmed) lives on the
    // aggregate; it throws before this use-case touches the repository's update.
    const patch = SubscriptionPlan.rehydrate(plan).applyUpdate(
      {
        name: input.name,
        priceMonthly,
        limits: input.limits,
        isActive: input.isActive,
        repriceExistingSubscribers: input.repriceExistingSubscribers,
      },
      subscriberCount,
    );

    const updated = await this.plans.update(id, patch);
    // Editing a plan cannot add or drop subscribers, so the count still holds.
    return { plan: updated, subscriberCount };
  }
}
