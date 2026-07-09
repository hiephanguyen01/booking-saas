import { z } from 'zod';
import { uuidSchema } from './common';

/** Discount codes (TONG-QUAN.md §12). Money is always a VND digit string on the wire. */
const vndDigits = z.string().regex(/^\d+$/, 'Must be a non-negative VND integer string');

export const promotionDiscountTypeSchema = z.enum(['percent', 'fixed']);
export type PromotionDiscountTypeDto = z.infer<typeof promotionDiscountTypeSchema>;

/** Phase 1 supports only site-wide (`all`) or a single listing. Wider scopes are Phase 2. */
export const promotionAppliesToSchema = z.enum(['all', 'listing']);
export type PromotionAppliesToDto = z.infer<typeof promotionAppliesToSchema>;

/** Admin-settable lifecycle states on create/update (`ended` is reached via the end endpoint). */
export const promotionStatusInputSchema = z.enum(['draft', 'active', 'paused']);
export type PromotionStatusInputDto = z.infer<typeof promotionStatusInputSchema>;

export const promotionStatusSchema = z.enum(['draft', 'active', 'paused', 'ended']);
export type PromotionStatusDto = z.infer<typeof promotionStatusSchema>;

const promotionBaseSchema = z.object({
  name: z.string().min(1).max(200),
  /** Customer-entered code, unique within the tenant; normalised to uppercase server-side. */
  code: z.string().min(1).max(50),
  discountType: promotionDiscountTypeSchema,
  /** `percent`: whole percent 1–100. `fixed`: VND đồng. Digit string either way. */
  discountValue: vndDigits,
  /** Cap on the discount for a `percent` code. */
  maxDiscount: vndDigits.optional(),
  appliesTo: promotionAppliesToSchema.default('all'),
  /** Required when `appliesTo === 'listing'`. */
  appliesToId: uuidSchema.optional(),
  minOrderAmount: vndDigits.optional(),
  usageLimitTotal: z.number().int().positive().max(1_000_000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: promotionStatusInputSchema.default('draft'),
});

function refineScope(data: { appliesTo: PromotionAppliesToDto; appliesToId?: string }, ctx: z.RefinementCtx): void {
  if (data.appliesTo === 'listing' && !data.appliesToId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['appliesToId'], message: 'appliesToId is required for a listing-scoped promotion' });
  }
}

function refinePercent(
  data: { discountType?: PromotionDiscountTypeDto; discountValue?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.discountType === 'percent' && data.discountValue !== undefined) {
    const n = Number(data.discountValue);
    if (n < 1 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'A percent discount must be between 1 and 100' });
    }
  }
}

export const createPromotionInputSchema = promotionBaseSchema.superRefine((data, ctx) => {
  refineScope(data, ctx);
  refinePercent(data, ctx);
});
export type CreatePromotionInput = z.infer<typeof createPromotionInputSchema>;

export const updatePromotionInputSchema = promotionBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.appliesTo !== undefined) refineScope({ appliesTo: data.appliesTo, appliesToId: data.appliesToId }, ctx);
    refinePercent(data, ctx);
  });
export type UpdatePromotionInput = z.infer<typeof updatePromotionInputSchema>;

/** Storefront checkout validation (§12.3). */
export const validatePromoInputSchema = z.object({
  code: z.string().min(1).max(50),
  listingId: uuidSchema,
  /** The pre-discount order subtotal, in VND đồng. */
  amount: vndDigits,
});
export type ValidatePromoInput = z.infer<typeof validatePromoInputSchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

/** Stable i18n error codes surfaced to the storefront (§12.3). */
export type PromoErrorCode =
  | 'PROMO_NOT_FOUND'
  | 'PROMO_EXPIRED'
  | 'PROMO_LIMIT_REACHED'
  | 'PROMO_MIN_ORDER'
  | 'PROMO_NOT_APPLICABLE';

export interface ValidatePromoResponse {
  valid: boolean;
  /** VND đồng digit strings. `0` when invalid. */
  discountAmount: string;
  finalAmount: string;
  code: string;
  /** A stable {@link PromoErrorCode} when `valid` is false. */
  error?: PromoErrorCode;
}

export interface PromotionResponse {
  id: string;
  name: string;
  code: string | null;
  discountType: PromotionDiscountTypeDto;
  /** VND đồng digit strings. `discountValue` is a whole percent for `percent` codes. */
  discountValue: string;
  maxDiscount: string | null;
  fundedBy: 'tenant' | 'partner';
  appliesTo: 'all' | 'listing_type' | 'listing_group' | 'category' | 'listing' | 'partner';
  appliesToId: string | null;
  minOrderAmount: string | null;
  usageLimitTotal: number | null;
  redeemedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  status: PromotionStatusDto;
  createdAt: string;
}

export interface PromoUsageStatsResponse {
  promotionId: string;
  code: string | null;
  usageLimitTotal: number | null;
  redeemedCount: number;
  reservedCount: number;
  appliedCount: number;
  releasedCount: number;
  /** Sum of discount granted across non-released redemptions, VND đồng digit string. */
  totalDiscount: string;
}
