import { percentOfBps } from '../../../shared/money/money';

/**
 * Pure promotion domain (TONG-QUAN.md §12). No framework / Prisma imports — the
 * discount maths and applicability rules live here so they are unit-testable in
 * isolation and identical between the storefront `validate-promo` preview and
 * the authoritative reservation at booking creation.
 */

export type PromoDiscountType = 'percent' | 'fixed';
export type PromoAppliesTo = 'all' | 'listing_type' | 'listing_group' | 'category' | 'listing' | 'partner';
export type PromoStatus = 'draft' | 'active' | 'paused' | 'ended';

/** Framework-free view of a `promotions` row. */
export interface PromotionSpec {
  id: string;
  code: string | null;
  discountType: PromoDiscountType;
  /** `percent`: a whole percent (10 = 10%). `fixed`: VND đồng. */
  discountValue: bigint;
  maxDiscount: bigint | null;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  minOrderAmount: bigint | null;
  usageLimitTotal: number | null;
  redeemedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: PromoStatus;
}

/** Stable i18n rejection codes (§12.3). */
export type PromoRejection =
  | 'PROMO_NOT_FOUND'
  | 'PROMO_EXPIRED'
  | 'PROMO_LIMIT_REACHED'
  | 'PROMO_MIN_ORDER'
  | 'PROMO_NOT_APPLICABLE';

export interface PromoContext {
  listingId: string;
  amount: bigint;
  now: Date;
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

/** True when the promotion's scope covers this listing (Phase 1: `all` or a specific listing). */
export function scopeMatches(promo: PromotionSpec, listingId: string): boolean {
  if (promo.appliesTo === 'all') return true;
  if (promo.appliesTo === 'listing') return promo.appliesToId === listingId;
  // listing_type / listing_group / category / partner scopes are Phase 2.
  return false;
}

/** Applicability gate — returns a rejection code, or `null` when the code applies. */
export function checkApplicability(promo: PromotionSpec, ctx: PromoContext): PromoRejection | null {
  if (promo.status !== 'active') return 'PROMO_NOT_APPLICABLE';
  if (promo.startsAt !== null && ctx.now < promo.startsAt) return 'PROMO_EXPIRED';
  if (promo.endsAt !== null && ctx.now >= promo.endsAt) return 'PROMO_EXPIRED';
  if (promo.usageLimitTotal !== null && promo.redeemedCount >= promo.usageLimitTotal) return 'PROMO_LIMIT_REACHED';
  if (!scopeMatches(promo, ctx.listingId)) return 'PROMO_NOT_APPLICABLE';
  if (promo.minOrderAmount !== null && ctx.amount < promo.minOrderAmount) return 'PROMO_MIN_ORDER';
  return null;
}

/** Full evaluation: applicability + discount maths, used by both the preview and the reservation. */
export function evaluatePromo(promo: PromotionSpec, ctx: PromoContext): PromoEvaluation {
  const rejection = checkApplicability(promo, ctx);
  if (rejection) return { ok: false, rejection };
  const discountAmount = computeDiscount(promo, ctx.amount);
  return { ok: true, discountAmount, finalAmount: ctx.amount - discountAmount };
}
