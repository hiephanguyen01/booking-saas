import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdatePlanInput } from '@booking/contracts';
import {
  PLAN_REPOSITORY,
  type IPlanRepository,
  type PlanWithSubscribers,
} from '../../domain/ports/plan-repository.port';

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
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(id: string, input: UpdatePlanInput): Promise<PlanWithSubscribers> {
    const plan = await this.plans.findById(id);
    if (!plan) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PLAN_NOT_FOUND',
        message: `Plan ${id} not found`,
      });
    }

    // Checked up-front so the UNIQUE violation never escapes as a Prisma error.
    if (input.name !== undefined && input.name !== plan.name) {
      const clash = await this.plans.findByName(input.name);
      if (clash) {
        throw new ConflictException({
          statusCode: 409,
          code: 'PLAN_NAME_TAKEN',
          message: `Plan name "${input.name}" is already in use`,
        });
      }
    }

    // Money is parsed with BigInt, never Number — a VND price can exceed 2^53.
    const priceMonthly = input.priceMonthly === undefined ? undefined : BigInt(input.priceMonthly);
    // Re-submitting the same price is not a re-price, so it needs no confirmation.
    const repricing = priceMonthly !== undefined && priceMonthly !== plan.priceMonthly;
    const subscriberCount = (await this.plans.liveSubscriberCounts()).get(id) ?? 0;

    if (repricing && subscriberCount > 0 && input.repriceExistingSubscribers !== true) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PLAN_HAS_SUBSCRIBERS',
        message:
          `Changing this plan's price re-prices ${subscriberCount} tenant(s) already subscribed ` +
          `to it, because a subscription reads its price from the plan and stores no snapshot. ` +
          `Resend with repriceExistingSubscribers: true to confirm, or create a new plan and ` +
          `migrate tenants to it to leave existing billing untouched.`,
        details: { subscribers: subscriberCount },
      });
    }

    const updated = await this.plans.update(id, {
      name: input.name,
      priceMonthly,
      limits: input.limits,
      isActive: input.isActive,
    });
    // Editing a plan cannot add or drop subscribers, so the count still holds.
    return { plan: updated, subscriberCount };
  }
}
