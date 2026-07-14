import { percentOfBps } from '../../../shared/money/money';

/**
 * Pure promotion domain (TONG-QUAN.md §12). No framework / Prisma imports — the
 * discount maths and applicability rules live here so they are unit-testable in
 * isolation and identical between the storefront `validate-promo` preview and
 * the authoritative reservation at booking creation.
 *
 * Phase 2 (§12.1) widens this: full scope set, `funded_by = partner` (with an
 * opt-in gate), first-booking-only + per-customer limits, off-peak time windows,
 * and auto-applied campaigns (code-less promotions selected by best discount).
 */

export type PromoDiscountType = 'percent' | 'fixed';
export type PromoFundedBy = 'tenant' | 'partner';
export type PromoAppliesTo = 'all' | 'listing_type' | 'listing_group' | 'category' | 'listing' | 'partner';
export type PromoStatus = 'draft' | 'active' | 'paused' | 'ended';

/** Off-peak window (§12.1): the booking must start on one of `days` within [from, to) local time. */
export interface PromoTimeWindow {
  /** ISO weekday numbers 0 (Sun)–6 (Sat). */
  days: number[];
  /** `HH:MM` (24h) in the resource's timezone. */
  from: string;
  to: string;
}

/** Framework-free view of a `promotions` row. */
export interface PromotionSpec {
  id: string;
  code: string | null;
  discountType: PromoDiscountType;
  /** `percent`: a whole percent (10 = 10%). `fixed`: VND đồng. */
  discountValue: bigint;
  maxDiscount: bigint | null;
  fundedBy: PromoFundedBy;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  minOrderAmount: bigint | null;
  firstBookingOnly: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  timeWindows: PromoTimeWindow[] | null;
  redeemedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: PromoStatus;
  /** Null while a partner-funded promo is pending the partner's opt-in (§12.2). */
  partnerOptInAt: Date | null;
}

/** Stable i18n rejection codes (§12.3). */
export type PromoRejection =
  | 'PROMO_NOT_FOUND'
  | 'PROMO_EXPIRED'
  | 'PROMO_LIMIT_REACHED'
  | 'PROMO_MIN_ORDER'
  | 'PROMO_NOT_APPLICABLE'
  | 'PROMO_FIRST_BOOKING_ONLY'
  | 'PROMO_TIME_WINDOW'
  | 'PROMO_NOT_OPTED_IN';

/** The listing/slot/customer context a promotion is evaluated against. */
export interface PromoContext {
  listingId: string;
  listingTypeId: string;
  groupId: string | null;
  categoryId: string | null;
  partnerId: string;
  amount: bigint;
  now: Date;
  /** Slot start + resource timezone — needed to evaluate off-peak windows. */
  slotStart: Date | null;
  timezone: string;
  /**
   * The customer's prior non-draft bookings in the tenant, for `first_booking_only`.
   * `undefined` = unknown (storefront preview) → the check is skipped (authoritative at booking).
   */
  customerPriorBookings?: number;
  /** The customer's active (non-released) redemptions of this promo, for the per-customer limit. */
  customerRedemptions?: number;
}

export type PromoEvaluation =
  | { ok: true; discountAmount: bigint; finalAmount: bigint }
  | { ok: false; rejection: PromoRejection };

/**
 * Discount for `amount`, clamped so it is never negative and never exceeds the
 * order (§12.2). `percent` applies the optional `max_discount` cap; `fixed` is a
 * flat amount that cannot exceed the order value.
 */
export function computeDiscount(promo: PromotionSpec, amount: bigint): bigint {
  if (amount <= 0n) return 0n;
  let discount: bigint;
  if (promo.discountType === 'percent') {
    // whole percent → basis points (10% → 1000 bps), half-up rounding.
    discount = percentOfBps(amount, Number(promo.discountValue) * 100);
    if (promo.maxDiscount !== null && discount > promo.maxDiscount) discount = promo.maxDiscount;
  } else {
    discount = promo.discountValue;
  }
  if (discount < 0n) discount = 0n;
  if (discount > amount) discount = amount; // a fixed code never makes the order negative
  return discount;
}

/** True when the promotion's scope covers this listing context (all 6 scopes, §12.2). */
export function scopeMatches(promo: PromotionSpec, ctx: PromoContext): boolean {
  switch (promo.appliesTo) {
    case 'all':
      return true;
    case 'listing':
      return promo.appliesToId === ctx.listingId;
    case 'listing_type':
      return promo.appliesToId === ctx.listingTypeId;
    case 'listing_group':
      return promo.appliesToId !== null && promo.appliesToId === ctx.groupId;
    case 'category':
      return promo.appliesToId !== null && promo.appliesToId === ctx.categoryId;
    case 'partner':
      return promo.appliesToId === ctx.partnerId;
    default:
      return false;
  }
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The instant's weekday (0–6) and minutes-since-midnight in `tz`. */
function localDayAndMinutes(date: Date, tz: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const hour = rawHour === 24 ? 0 : rawHour; // some engines render midnight as 24 under hour12:false
  return { day: WEEKDAY_INDEX[weekday] ?? 0, minutes: hour * 60 + minute };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * True when `slotStart` (in `tz`) falls on a listed day inside one of the [from, to)
 * windows. An empty/null window list means "always applicable".
 */
export function timeWindowMatches(windows: PromoTimeWindow[] | null, slotStart: Date | null, tz: string): boolean {
  if (windows === null || windows.length === 0) return true;
  if (slotStart === null) return false; // windows configured but the slot is unknown → cannot confirm
  const { day, minutes } = localDayAndMinutes(slotStart, tz);
  return windows.some(
    (w) => w.days.includes(day) && minutes >= hhmmToMinutes(w.from) && minutes < hhmmToMinutes(w.to),
  );
}

/** Applicability gate — returns a rejection code, or `null` when the promotion applies. */
export function checkApplicability(promo: PromotionSpec, ctx: PromoContext): PromoRejection | null {
  if (promo.status !== 'active') return 'PROMO_NOT_APPLICABLE';
  if (promo.startsAt !== null && ctx.now < promo.startsAt) return 'PROMO_EXPIRED';
  if (promo.endsAt !== null && ctx.now >= promo.endsAt) return 'PROMO_EXPIRED';
  // A partner-funded promo cannot apply until the funding partner has opted in (§12.2).
  if (promo.fundedBy === 'partner' && promo.partnerOptInAt === null) return 'PROMO_NOT_OPTED_IN';
  if (promo.usageLimitTotal !== null && promo.redeemedCount >= promo.usageLimitTotal) return 'PROMO_LIMIT_REACHED';
  if (!scopeMatches(promo, ctx)) return 'PROMO_NOT_APPLICABLE';
  if (promo.minOrderAmount !== null && ctx.amount < promo.minOrderAmount) return 'PROMO_MIN_ORDER';
  if (!timeWindowMatches(promo.timeWindows, ctx.slotStart, ctx.timezone)) return 'PROMO_TIME_WINDOW';
  // First-booking-only + per-customer limit need customer identity; skipped when unknown (preview).
  if (promo.firstBookingOnly && ctx.customerPriorBookings !== undefined && ctx.customerPriorBookings > 0) {
    return 'PROMO_FIRST_BOOKING_ONLY';
  }
  if (
    promo.usageLimitPerCustomer !== null &&
    ctx.customerRedemptions !== undefined &&
    ctx.customerRedemptions >= promo.usageLimitPerCustomer
  ) {
    return 'PROMO_LIMIT_REACHED';
  }
  return null;
}

/** Full evaluation: applicability + discount maths, used by both the preview and the reservation. */
export function evaluatePromo(promo: PromotionSpec, ctx: PromoContext): PromoEvaluation {
  const rejection = checkApplicability(promo, ctx);
  if (rejection) return { ok: false, rejection };
  const discountAmount = computeDiscount(promo, ctx.amount);
  return { ok: true, discountAmount, finalAmount: ctx.amount - discountAmount };
}

export interface SelectedAutoCampaign<T extends PromotionSpec = PromotionSpec> {
  promo: T;
  discountAmount: bigint;
  finalAmount: bigint;
}

/**
 * No-stacking winner selection for auto-applied campaigns (§12.1): among the
 * code-less campaigns that apply to this context, pick the one giving the largest
 * actual discount. A customer-entered code takes precedence over any auto-campaign
 * — that short-circuit lives in `ApplyPromotionService`, not here. Returns `null`
 * when no campaign applies. Generic so callers keep their full record type (e.g.
 * a `PromotionRecord` with `name`).
 */
export function selectBestAutoCampaign<T extends PromotionSpec>(
  candidates: T[],
  ctx: PromoContext,
): SelectedAutoCampaign<T> | null {
  let best: SelectedAutoCampaign<T> | null = null;
  for (const promo of candidates) {
    if (promo.code !== null) continue; // only auto-campaigns (a code is customer-entered, never auto)
    if (checkApplicability(promo, ctx) !== null) continue;
    const discountAmount = computeDiscount(promo, ctx.amount);
    if (discountAmount <= 0n) continue;
    if (best === null || discountAmount > best.discountAmount) {
      best = { promo, discountAmount, finalAmount: ctx.amount - discountAmount };
    }
  }
  return best;
}
