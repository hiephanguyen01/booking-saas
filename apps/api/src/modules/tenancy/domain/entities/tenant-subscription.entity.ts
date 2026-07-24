import type { SubscriptionState } from '../subscription-status';
import { InvalidSubscriptionPeriod } from '../errors/billing-errors';

/**
 * TenantSubscription aggregate (§3.1) — one row recording a tenant's assignment
 * to a `SubscriptionPlan` for a `[startsAt, expiresAt)` period.
 *
 * The stream is **append-only**: `AssignSubscriptionUseCase` assigning a plan to
 * a tenant always INSERTs a new row; a new assignment supersedes the previous
 * one by being more recent, but the previous row is never updated or deleted —
 * it stays as billing history (`ISubscriptionRepository.listByTenant`).
 *
 * "Current subscription" is, as of this PR, defined by **three implementations
 * that disagree** — a recorded known gap (§8a) this PR deliberately does NOT
 * fix:
 *   - `ISubscriptionRepository.findCurrentByTenant` (`PrismaSubscriptionRepository`,
 *     the TypeScript path) orders by `startsAt DESC` alone, with **no
 *     `created_at` tiebreak**;
 *   - `PrismaPlanRepository.liveSubscriberCounts` and
 *     `GetPlatformHealthUseCase`'s platform-health query are both raw SQL and
 *     both order by `starts_at DESC, created_at DESC`.
 *   On a `startsAt` tie (e.g. two assignments issued in the same request burst,
 *   or a back-dated assignment), the TypeScript path and the two SQL copies can
 *   pick different rows as "the current one". Left as-is here.
 *
 * The §6.5 lifecycle rules — grace period, storefront/dashboard/booking gating —
 * live exclusively in `evaluateSubscription` (`domain/subscription-status.ts`);
 * this aggregate does not restate them, it only validates the period on
 * assignment.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** Validated insert payload (id assigned by the DB). */
export interface NewTenantSubscription {
  tenantId: string;
  planId: string;
  status: SubscriptionState;
  startsAt: Date;
  expiresAt: Date;
  note: string | null;
}

export class TenantSubscription {
  private constructor() {}

  /**
   * Assign a plan to a tenant for `[startsAt, expiresAt)`. `startsAt` defaults to
   * "now" in the use-case, not here — this aggregate reads no clock and takes no
   * randomness, only what the caller supplies.
   */
  static assign(input: {
    tenantId: string;
    planId: string;
    status: SubscriptionState;
    startsAt: Date;
    expiresAt: Date;
    note: string | null;
  }): NewTenantSubscription {
    if (input.expiresAt <= input.startsAt) throw new InvalidSubscriptionPeriod();
    return {
      tenantId: input.tenantId,
      planId: input.planId,
      status: input.status,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      note: input.note,
    };
  }
}
