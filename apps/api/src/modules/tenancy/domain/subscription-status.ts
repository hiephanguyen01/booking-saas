/**
 * Subscription lifecycle evaluation (TONG-QUAN.md §6.5). An expired subscription
 * suspends the storefront and makes the dashboard read-only; a 30-day grace
 * period follows expiry (existing confirmed bookings are still honoured and
 * payouts settled) before data is eligible for retention/anonymization.
 */

export type SubscriptionState = 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';

export interface SubscriptionSnapshot {
  status: SubscriptionState;
  startsAt: Date;
  expiresAt: Date;
}

export const GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface SubscriptionEvaluation {
  phase: 'active' | 'grace' | 'expired';
  /** false → storefront renders the suspended page. */
  storefrontLive: boolean;
  /** false → dashboard is read-only. */
  dashboardWritable: boolean;
  /** false → no new bookings may be created (§6.5). */
  newBookingsAllowed: boolean;
  /** negative once past the expiry date. */
  daysUntilExpiry: number;
}

export function evaluateSubscription(
  sub: SubscriptionSnapshot | null,
  now: Date,
): SubscriptionEvaluation {
  if (!sub) {
    return {
      phase: 'expired',
      storefrontLive: false,
      dashboardWritable: false,
      newBookingsAllowed: false,
      daysUntilExpiry: 0,
    };
  }

  const daysUntilExpiry = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
  // Suspension keys off the *expiry date*, not the payment status (§6.5): a
  // `past_due` sub is in dunning — payment failed but the paid-through date has
  // not yet passed — so it stays live until it actually expires, exactly like
  // `active`/`trial`. Only `cancelled` (explicit) and a lapsed date suspend.
  const activeStatus =
    sub.status === 'active' || sub.status === 'trial' || sub.status === 'past_due';

  if (activeStatus && now < sub.expiresAt) {
    return {
      phase: 'active',
      storefrontLive: true,
      dashboardWritable: true,
      newBookingsAllowed: true,
      daysUntilExpiry,
    };
  }

  const daysSinceExpiry = Math.floor((now.getTime() - sub.expiresAt.getTime()) / MS_PER_DAY);
  return {
    phase: daysSinceExpiry < GRACE_PERIOD_DAYS ? 'grace' : 'expired',
    storefrontLive: false,
    dashboardWritable: false,
    newBookingsAllowed: false,
    daysUntilExpiry,
  };
}
