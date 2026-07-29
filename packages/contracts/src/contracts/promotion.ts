import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

/** Discount codes (TONG-QUAN.md §12). Money is always a VND digit string on the wire. */
const vndDigits = z.string().regex(/^\d+$/, 'Must be a non-negative VND integer string');

export const promotionDiscountTypeSchema = z.enum(['percent', 'fixed']);
export type PromotionDiscountTypeDto = z.infer<typeof promotionDiscountTypeSchema>;

/** Who bears the discount cost (§12.4) — drives the commission split. */
export const promotionFundedBySchema = z.enum(['tenant', 'partner']);
export type PromotionFundedByDto = z.infer<typeof promotionFundedBySchema>;

/** Full scope set (§12.2 Phase 2): site-wide, or a listing / type / group / category / partner. */
export const promotionAppliesToSchema = z.enum([
  'all',
  'listing_type',
  'listing_group',
  'category',
  'listing',
  'partner',
]);
export type PromotionAppliesToDto = z.infer<typeof promotionAppliesToSchema>;

/** Scopes that identify a single partner — required when `fundedBy === 'partner'` (§12.2). */
const SINGLE_PARTNER_SCOPES: readonly PromotionAppliesToDto[] = ['partner', 'listing', 'listing_group'];

/** Admin-settable lifecycle states on create/update (`ended` is reached via the end endpoint). */
export const promotionStatusInputSchema = z.enum(['draft', 'active', 'paused']);
export type PromotionStatusInputDto = z.infer<typeof promotionStatusInputSchema>;

export const promotionStatusSchema = z.enum(['draft', 'active', 'paused', 'ended']);
export type PromotionStatusDto = z.infer<typeof promotionStatusSchema>;

/** `GET /tenant/promotions` — paginated; name/code search + status + created-at range. */
export const listPromotionsQuerySchema = paginationQuerySchema.extend({
  /** Case-insensitive search over promotion name / code. */
  q: z.string().trim().max(200).optional(),
  status: promotionStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListPromotionsQuery = z.infer<typeof listPromotionsQuerySchema>;

/** `GET /partner/promotions` — same filters, scoped to the partner's own promotions. */
export const listPartnerPromotionsQuerySchema = listPromotionsQuerySchema;
export type ListPartnerPromotionsQuery = z.infer<typeof listPartnerPromotionsQuerySchema>;

/** Off-peak window (§12.1 Phase 2): the booking must start on one of `days` within [from, to). */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24h)');
export const promotionTimeWindowSchema = z.object({
  /** ISO weekday numbers 0 (Sun)–6 (Sat), matching pricing_rules. */
  days: z.array(z.number().int().min(0).max(6)).min(1),
  from: hhmm,
  to: hhmm,
});
export type PromotionTimeWindowDto = z.infer<typeof promotionTimeWindowSchema>;

/**
 * Every optional *condition* on a promotion is `nullish`, not `optional`, and the
 * distinction is load-bearing on update: **omitted = leave the stored value alone,
 * explicit `null` = clear it**. When these were plain `optional()` the update
 * use-cases' `if (x !== undefined)` guards silently skipped a cleared field, so a
 * cap/limit/window could be set once and never removed. Any new condition field
 * must follow the same rule, and the matching update use-case must map
 * `null → null` rather than `?? existing`.
 */
const promotionBaseSchema = z.object({
  name: z.string().min(1).max(200),
  /**
   * Customer-entered code, unique within the tenant; normalised to uppercase server-side.
   * `null` / omitted = an auto-applied campaign (§12.1 Phase 2 — no code needed).
   */
  code: z.string().min(1).max(50).nullish(),
  discountType: promotionDiscountTypeSchema,
  /** `percent`: whole percent 1–100. `fixed`: VND đồng. Digit string either way. */
  discountValue: vndDigits,
  /** Cap on the discount for a `percent` code. `null` clears the cap. */
  maxDiscount: vndDigits.nullish(),
  /** Who bears the cost (§12.4). `partner` requires a single-partner scope + opt-in. */
  fundedBy: promotionFundedBySchema.default('tenant'),
  appliesTo: promotionAppliesToSchema.default('all'),
  /** Required for every scope except `all` (the id of the listing/type/group/category/partner). */
  appliesToId: uuidSchema.optional(),
  /** `null` clears the minimum-order condition. */
  minOrderAmount: vndDigits.nullish(),
  /** Only applies to a customer's first booking in the tenant (§12.2). */
  firstBookingOnly: z.boolean().default(false),
  /** Whether a code may be discovered in the public storefront checkout picker. */
  storefrontVisible: z.boolean().default(false),
  /** `null` clears the total usage cap (unlimited). */
  usageLimitTotal: z.number().int().positive().max(1_000_000).nullish(),
  /** Per-customer usage cap (§12.2). `null` clears it (unlimited). */
  usageLimitPerCustomer: z.number().int().positive().max(100_000).nullish(),
  /**
   * Off-peak windows — the discount only applies when the slot starts inside one of
   * them. `null` (or `[]`) clears them, making the promotion always-applicable.
   */
  timeWindows: z.array(promotionTimeWindowSchema).nullish(),
  /** `null` clears the start bound (active immediately). */
  startsAt: z.string().datetime().nullish(),
  /** `null` clears the end bound (no expiry). */
  endsAt: z.string().datetime().nullish(),
  status: promotionStatusInputSchema.default('draft'),
});

function refineScope(
  data: { appliesTo: PromotionAppliesToDto; appliesToId?: string; fundedBy?: PromotionFundedByDto },
  ctx: z.RefinementCtx,
): void {
  if (data.appliesTo !== 'all' && !data.appliesToId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['appliesToId'],
      message: 'appliesToId is required for a scoped promotion',
    });
  }
  // A partner-funded promo must target a single identifiable partner so it can be opted in (§12.2).
  if (data.fundedBy === 'partner' && !SINGLE_PARTNER_SCOPES.includes(data.appliesTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fundedBy'],
      message: 'A partner-funded promotion must be scoped to a partner, listing, or listing group',
    });
  }
}

function refinePercent(
  data: { discountType?: PromotionDiscountTypeDto; discountValue?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.discountType === 'percent' && data.discountValue !== undefined) {
    const n = Number(data.discountValue);
    if (n < 1 || n > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'A percent discount must be between 1 and 100',
      });
    }
  }
}

function refineTimeWindows(data: { timeWindows?: PromotionTimeWindowDto[] | null }, ctx: z.RefinementCtx): void {
  (data.timeWindows ?? []).forEach((w, i) => {
    if (w.from >= w.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeWindows', i, 'to'],
        message: 'Window end must be after its start',
      });
    }
  });
}

export const createPromotionInputSchema = promotionBaseSchema.superRefine((data, ctx) => {
  refineScope(data, ctx);
  refinePercent(data, ctx);
  refineTimeWindows(data, ctx);
});
export type CreatePromotionInput = z.infer<typeof createPromotionInputSchema>;

export const updatePromotionInputSchema = promotionBaseSchema.partial().superRefine((data, ctx) => {
  if (data.appliesTo !== undefined) {
    refineScope({ appliesTo: data.appliesTo, appliesToId: data.appliesToId, fundedBy: data.fundedBy }, ctx);
  }
  refinePercent(data, ctx);
  refineTimeWindows(data, ctx);
});
export type UpdatePromotionInput = z.infer<typeof updatePromotionInputSchema>;

/**
 * Partner-created code (§12.2 Phase 2). Always partner-funded + auto-opted-in; the scope is
 * restricted to the partner's own listings/groups server-side, so no `fundedBy`/scope-partner here.
 */
const partnerPromotionBaseSchema = promotionBaseSchema.pick({
  name: true,
  code: true,
  discountType: true,
  discountValue: true,
  maxDiscount: true,
  appliesTo: true,
  appliesToId: true,
  minOrderAmount: true,
  firstBookingOnly: true,
  storefrontVisible: true,
  usageLimitTotal: true,
  usageLimitPerCustomer: true,
  timeWindows: true,
  startsAt: true,
  endsAt: true,
  status: true,
});

export const createPartnerPromotionInputSchema = partnerPromotionBaseSchema.superRefine((data, ctx) => {
  refineScope(data, ctx);
  refinePercent(data, ctx);
  refineTimeWindows(data, ctx);
});
export type CreatePartnerPromotionInput = z.infer<typeof createPartnerPromotionInputSchema>;

export const updatePartnerPromotionInputSchema = partnerPromotionBaseSchema.partial().superRefine((data, ctx) => {
  if (data.appliesTo !== undefined) refineScope({ appliesTo: data.appliesTo, appliesToId: data.appliesToId }, ctx);
  refinePercent(data, ctx);
  refineTimeWindows(data, ctx);
});
export type UpdatePartnerPromotionInput = z.infer<typeof updatePartnerPromotionInputSchema>;

/** Storefront checkout validation (§12.3). `start`/`end` enable off-peak window checks. */
export const validatePromoInputSchema = z.object({
  code: z.string().min(1).max(50),
  listingId: uuidSchema,
  /** The pre-discount order subtotal, in VND đồng. */
  amount: vndDigits,
  /** The chosen slot bounds (ISO) — required to evaluate off-peak windows. */
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});
export type ValidatePromoInput = z.infer<typeof validatePromoInputSchema>;

/** Storefront promotion discovery uses the same checkout context as code validation. */
export const storefrontPromotionsInputSchema = validatePromoInputSchema.omit({ code: true });
export type StorefrontPromotionsInput = z.infer<typeof storefrontPromotionsInputSchema>;

/** Storefront auto-campaign resolution (§12.1 Phase 2) — best code-less campaign for a slot. */
export const autoCampaignInputSchema = z.object({
  listingId: uuidSchema,
  amount: vndDigits,
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});
export type AutoCampaignInput = z.infer<typeof autoCampaignInputSchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

/** Stable i18n error codes surfaced to the storefront (§12.3). */
export const promoErrorCodeSchema = z.enum([
  'PROMO_NOT_FOUND',
  'PROMO_EXPIRED',
  'PROMO_LIMIT_REACHED',
  'PROMO_MIN_ORDER',
  'PROMO_NOT_APPLICABLE',
  'PROMO_FIRST_BOOKING_ONLY',
  'PROMO_TIME_WINDOW',
  'PROMO_NOT_OPTED_IN',
]);
export type PromoErrorCode = z.infer<typeof promoErrorCodeSchema>;

export const validatePromoResponseSchema = z.object({
  valid: z.boolean(),
  /** VND đồng digit strings. `0` when invalid. */
  discountAmount: z.string(),
  finalAmount: z.string(),
  code: z.string(),
  /** A stable {@link PromoErrorCode} when `valid` is false. */
  error: promoErrorCodeSchema.optional(),
});
export type ValidatePromoResponse = z.infer<typeof validatePromoResponseSchema>;

/** A discoverable promotion evaluated for the current storefront checkout. */
export const storefrontPromotionSchema = z.object({
  code: z.string(),
  name: z.string(),
  discountType: promotionDiscountTypeSchema,
  discountValue: z.string(),
  maxDiscount: z.string().nullable(),
  minOrderAmount: z.string().nullable(),
  firstBookingOnly: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  eligible: z.boolean(),
  discountAmount: z.string(),
  finalAmount: z.string(),
  error: promoErrorCodeSchema.optional(),
});
export type StorefrontPromotion = z.infer<typeof storefrontPromotionSchema>;

export const storefrontPromotionsResponseSchema = z.array(storefrontPromotionSchema);
export type StorefrontPromotionsResponse = z.infer<typeof storefrontPromotionsResponseSchema>;

/** A single applicable auto-campaign. */
export const autoCampaignSchema = z.object({
  promotionId: z.string(),
  name: z.string(),
  discountAmount: z.string(),
  finalAmount: z.string(),
});
export type AutoCampaign = z.infer<typeof autoCampaignSchema>;

/** The best applicable auto-campaign for a slot, or `null` when none applies. */
export const autoCampaignResponseSchema = autoCampaignSchema.nullable();
export type AutoCampaignResponse = z.infer<typeof autoCampaignResponseSchema>;

export const promotionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  discountType: promotionDiscountTypeSchema,
  /** VND đồng digit strings. `discountValue` is a whole percent for `percent` codes. */
  discountValue: z.string(),
  maxDiscount: z.string().nullable(),
  fundedBy: promotionFundedBySchema,
  appliesTo: promotionAppliesToSchema,
  appliesToId: z.string().nullable(),
  minOrderAmount: z.string().nullable(),
  firstBookingOnly: z.boolean(),
  storefrontVisible: z.boolean(),
  usageLimitTotal: z.number().nullable(),
  usageLimitPerCustomer: z.number().nullable(),
  timeWindows: z.array(promotionTimeWindowSchema).nullable(),
  redeemedCount: z.number(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  status: promotionStatusSchema,
  createdByPartnerId: z.string().nullable(),
  fundingPartnerId: z.string().nullable(),
  /** ISO timestamp of the partner's opt-in, or `null` while a partner-funded promo is pending. */
  partnerOptInAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PromotionResponse = z.infer<typeof promotionResponseSchema>;

/**
 * Read-one response (`GET /tenant|partner/promotions/:id`). Extends the list shape
 * with resolved display names so a detail page never has to render a bare uuid —
 * "waiting for the partner" can actually name the partner. The names are resolved
 * per-request, so they stay off the (cheap, paginated) list response.
 *
 * Each name is `null` when there is nothing to resolve (a tenant-funded promo has
 * no funding partner) or when the target no longer exists.
 */
export const promotionDetailResponseSchema = promotionResponseSchema.extend({
  /** Display name of `fundingPartnerId`. */
  fundingPartnerName: z.string().nullable(),
  /** Display name of `createdByPartnerId` (null for a tenant-created promo). */
  createdByPartnerName: z.string().nullable(),
  /** Human label of the `appliesToId` target — always `null` for the `all` scope. */
  appliesToLabel: z.string().nullable(),
});
export type PromotionDetailResponse = z.infer<typeof promotionDetailResponseSchema>;

/** A tenant category — backs the `category` promotion scope picker (§12.2). */
export const promotionCategoryOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type PromotionCategoryOption = z.infer<typeof promotionCategoryOptionSchema>;

export const promoUsageStatsResponseSchema = z.object({
  promotionId: z.string(),
  code: z.string().nullable(),
  usageLimitTotal: z.number().nullable(),
  redeemedCount: z.number(),
  reservedCount: z.number(),
  appliedCount: z.number(),
  releasedCount: z.number(),
  /** Sum of discount granted across non-released redemptions, VND đồng digit string. */
  totalDiscount: z.string(),
});
export type PromoUsageStatsResponse = z.infer<typeof promoUsageStatsResponseSchema>;
