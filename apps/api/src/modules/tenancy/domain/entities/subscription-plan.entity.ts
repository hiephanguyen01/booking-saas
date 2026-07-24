import type { PlanLimits } from '@booking/contracts';
import {
  PlanHasLiveSubscribers,
  PlanHasSubscriptionHistory,
  PlanRepricingNeedsConfirmation,
} from '../errors/billing-errors';

/**
 * SubscriptionPlan aggregate (§19) — one billing tier tenants subscribe to: a
 * name, a monthly VND price (`bigint`, never a float), and the {@link PlanLimits}
 * caps `domain/plan-limits.ts` evaluates against.
 *
 * Owns the two write rules that used to sit inline in the update/delete use-cases:
 *   - a price change is refused when it would silently re-price live subscribers,
 *     unless the caller confirms it ({@link SubscriptionPlan.applyUpdate}) —
 *     `tenant_subscriptions` stores no price snapshot, so every subscriber reads
 *     its plan's price live;
 *   - deletion is gated two-deep, live subscribers first, subscription history
 *     second ({@link SubscriptionPlan.assertDeletable}) — the live-subscriber
 *     case is the actionable one ("migrate them first"), so it is checked before
 *     the FK-is-RESTRICT history case.
 *
 * NOT owned here (deliberately): `name` uniqueness (`subscription_plans.name` is
 * DB UNIQUE; the update path pre-checks it advisory-style before this aggregate
 * ever sees the input — `open`/create has NO such pre-check today, a recorded
 * known gap, §8a); the subscriber counts `applyUpdate`/`assertDeletable` take as
 * plain numbers are resolved by the use-case via `IPlanRepository
 * .liveSubscriberCounts` / `.countSubscriptions` and handed in — this aggregate
 * never counts anything itself.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state these rules need. */
export interface PlanState {
  id: string;
  name: string;
  priceMonthly: bigint;
  limits: PlanLimits;
  isActive: boolean;
}

/** Validated insert payload (id/createdAt/updatedAt assigned by the DB). */
export interface NewSubscriptionPlan {
  name: string;
  priceMonthly: bigint;
  limits: PlanLimits;
  isActive: boolean;
}

/** The diff to persist — `undefined` on a key means "leave the stored value alone". */
export type SubscriptionPlanPatch = Partial<NewSubscriptionPlan>;

/**
 * `applyUpdate`'s input: the PATCH fields plus the repricing confirmation flag.
 * `priceMonthly`, like `open`'s, arrives already parsed to `bigint` by the use-case.
 */
export interface SubscriptionPlanUpdateFields {
  name?: string;
  priceMonthly?: bigint;
  limits?: PlanLimits;
  isActive?: boolean;
  /** Blast-radius acknowledgement — see {@link SubscriptionPlan.applyUpdate}. */
  repriceExistingSubscribers?: boolean;
}

export class SubscriptionPlan {
  private constructor(private readonly state: PlanState) {}

  /** Rehydrate for the update / delete paths. */
  static rehydrate(state: PlanState): SubscriptionPlan {
    return new SubscriptionPlan(state);
  }

  /**
   * Assemble a new plan. Deliberately no name pre-check here — `create-plan` has
   * never had one (a recorded known gap, §8a): a duplicate name today surfaces
   * only as the DB's UNIQUE violation. `applyUpdate` is the one path guarded,
   * and even that guard lives in the use-case, not here.
   */
  static open(input: {
    name: string;
    priceMonthly: bigint;
    limits: PlanLimits;
    isActive: boolean;
  }): NewSubscriptionPlan {
    return {
      name: input.name,
      priceMonthly: input.priceMonthly,
      limits: input.limits,
      isActive: input.isActive,
    };
  }

  /**
   * Merge a PATCH, absorbing the repricing gate: since `tenant_subscriptions`
   * stores no price snapshot, every subscriber reads its plan's price live, so
   * changing that price re-prices every tenant already on the plan. Refused
   * (via {@link PlanRepricingNeedsConfirmation}) when the price is actually being
   * changed to a value different from the one stored AND at least one subscriber
   * is live AND the caller did not explicitly confirm with
   * `repriceExistingSubscribers: true`. Re-submitting the same price is not a
   * re-price and needs no confirmation. `limits`/`isActive` are never gated —
   * limits track the plan's current caps and `isActive` only hides it from new
   * assignment.
   *
   * `subscriberCount` is resolved by the use-case
   * (`IPlanRepository.liveSubscriberCounts`) and handed in, never counted here.
   * Returns a patch containing exactly the keys supplied — an omitted key stays
   * `undefined`, which `IPlanRepository.update` treats as "leave untouched".
   */
  applyUpdate(
    input: SubscriptionPlanUpdateFields,
    subscriberCount: number,
  ): SubscriptionPlanPatch {
    const repricing =
      input.priceMonthly !== undefined && input.priceMonthly !== this.state.priceMonthly;
    if (repricing && subscriberCount > 0 && input.repriceExistingSubscribers !== true) {
      throw new PlanRepricingNeedsConfirmation(subscriberCount);
    }
    return {
      name: input.name,
      priceMonthly: input.priceMonthly,
      limits: input.limits,
      isActive: input.isActive,
    };
  }

  /**
   * Deletion is only allowed for a plan nothing references, checked in this
   * order: **live subscribers** first (409 `PLAN_HAS_SUBSCRIBERS` — dropping the
   * plan from under a paying tenant would strip its limits and price), then
   * **subscription history** (409 `PLAN_HAS_SUBSCRIPTION_HISTORY` — the plan FK
   * is RESTRICT, so a referenced row physically cannot be removed). Both counts
   * are resolved by the use-case and handed in as plain numbers.
   */
  assertDeletable(liveSubscribers: number, totalSubscriptions: number): void {
    if (liveSubscribers > 0) throw new PlanHasLiveSubscribers(liveSubscribers);
    if (totalSubscriptions > 0) throw new PlanHasSubscriptionHistory(totalSubscriptions);
  }
}
