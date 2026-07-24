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
 * "Current subscription" is selected only by `ICurrentSubscriptionReader`:
 * newest `startsAt`, then newest persistence `createdAt`. The reader resolves
 * the plan and captures PostgreSQL `now()` in the same statement, so guards,
 * storefront liveness, subscriber counts and platform health share one row and
 * one clock.
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
