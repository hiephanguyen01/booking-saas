import { z } from 'zod';
import { uuidSchema } from './common';
import { slugSchema } from './tenancy';
import { bookingModeSchema, type BookingMode } from './listing-type';

/** VND đồng as a digit string — money never travels as a JS number. */
const vndAmountSchema = z.string().regex(/^\d+$/, 'Must be an integer VND amount in đồng');
const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24h)');
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');
const weekdaySchema = z.number().int().min(0).max(6); // 0=Sun … 6=Sat

export const publishStatusSchema = z.enum(['draft', 'pending_review', 'published', 'archived']);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const balanceDueSchema = z.enum(['online_before', 'on_arrival']);
export type BalanceDue = z.infer<typeof balanceDueSchema>;

/** Who performed a moderation action — a partner or an admin/tenant reviewer (§7.3). */
export const moderationActorSchema = z.enum(['partner', 'admin']);
export type ModerationActor = z.infer<typeof moderationActorSchema>;

export const pricingRuleTypeSchema = z.enum(['day_of_week', 'time_range', 'date_range']);
export type PricingRuleType = z.infer<typeof pricingRuleTypeSchema>;

// ── mode_config (§7.3) ───────────────────────────────────────────────────────

export const hourlyModeConfigSchema = z
  .object({
    basePrice: vndAmountSchema,
    blocks: z.array(z.object({ hours: z.number().int().positive(), price: vndAmountSchema })).default([]),
    minDuration: z.number().int().positive().default(1),
    maxDuration: z.number().int().positive().default(8),
    granularity: z.number().int().positive().default(60),
    leadTimeMin: z.number().int().nonnegative().default(0),
  })
  .superRefine((c, ctx) => {
    if (c.maxDuration < c.minDuration) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxDuration'], message: 'maxDuration must be ≥ minDuration' });
    }
  });

export const dailyModeConfigSchema = z
  .object({
    basePricePerNight: vndAmountSchema,
    blocks: z.array(z.object({ days: z.number().int().positive(), price: vndAmountSchema })).default([]),
    minNights: z.number().int().positive().default(1),
    maxNights: z.number().int().positive().default(30),
    checkinTime: timeStringSchema.default('14:00'),
    checkoutTime: timeStringSchema.default('12:00'),
    leadTimeMin: z.number().int().nonnegative().default(0),
  })
  .superRefine((c, ctx) => {
    if (c.maxNights < c.minNights) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxNights'], message: 'maxNights must be ≥ minNights' });
    }
  });

export const inventoryModeConfigSchema = z.object({
  unit: z.enum(['hour', 'day']),
  basePrice: vndAmountSchema,
  securityDeposit: vndAmountSchema.default('0'),
  minDuration: z.number().int().positive().optional(),
  maxDuration: z.number().int().positive().optional(),
  /** Late-return fee per overdue unit per item (§9.4); defaults to basePrice. */
  lateFeePerUnit: vndAmountSchema.optional(),
});

export const modeConfigSchema = z.object({
  hourly: hourlyModeConfigSchema.optional(),
  daily: dailyModeConfigSchema.optional(),
  inventory: inventoryModeConfigSchema.optional(),
});
export type ModeConfig = z.infer<typeof modeConfigSchema>;

// ── Inputs ───────────────────────────────────────────────────────────────────

export const createListingGroupInputSchema = z.object({
  partnerId: uuidSchema,
  listingTypeId: uuidSchema,
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional(),
  address: z.string().max(500).optional(),
  workingArea: z.string().max(200).optional(),
  amenities: z.array(z.string().min(1)).default([]),
  photos: z.array(z.string().url()).default([]),
});
export type CreateListingGroupInput = z.infer<typeof createListingGroupInputSchema>;

export const updateListingGroupInputSchema = createListingGroupInputSchema.partial();
export type UpdateListingGroupInput = z.infer<typeof updateListingGroupInputSchema>;

const listingBaseSchema = z.object({
  partnerId: uuidSchema,
  listingTypeId: uuidSchema,
  groupId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  resourceId: uuidSchema.optional(),
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional(),
  photos: z.array(z.string().url()).default([]),
  attributes: z.record(z.unknown()).default({}),
  bookingModes: z.array(bookingModeSchema).min(1),
  modeConfig: modeConfigSchema,
  stockQuantity: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  bufferBefore: z.number().int().nonnegative().default(0),
  bufferAfter: z.number().int().nonnegative().default(0),
  approvalRequired: z.boolean().default(false),
  depositPercent: z.number().int().min(0).max(100).default(100),
  balanceDue: balanceDueSchema.default('online_before'),
  cancellationPolicyId: uuidSchema.optional(),
});

/** Each enabled mode must have matching mode_config; inventory needs stockQuantity. */
const modeConfigCoversModes = (
  value: { bookingModes?: BookingMode[]; modeConfig?: ModeConfig; stockQuantity?: number },
  ctx: z.RefinementCtx,
): void => {
  if (!value.bookingModes || !value.modeConfig) return;
  const config = value.modeConfig as Record<string, unknown>;
  for (const mode of value.bookingModes) {
    if (config[mode] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['modeConfig'], message: `modeConfig.${mode} is required for enabled mode "${mode}"` });
    }
  }
  if (value.bookingModes.includes('inventory') && value.stockQuantity === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stockQuantity'], message: 'stockQuantity is required for inventory mode' });
  }
};

export const createListingInputSchema = listingBaseSchema.superRefine(modeConfigCoversModes);
export type CreateListingInput = z.infer<typeof createListingInputSchema>;

export const updateListingInputSchema = listingBaseSchema.partial().superRefine(modeConfigCoversModes);
export type UpdateListingInput = z.infer<typeof updateListingInputSchema>;

export const createResourceInputSchema = z.object({
  partnerId: uuidSchema,
  name: z.string().min(1).max(200),
  // Optional — when omitted the server applies the tenant's own default_timezone
  // (not a hardcoded zone), so non-VN tenants get their configured zone.
  timezone: z.string().min(1).max(64).optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;

export const dayOfWeekParamsSchema = z.object({ days: z.array(weekdaySchema).min(1) });
export const timeRangeParamsSchema = z.object({
  from: timeStringSchema,
  to: timeStringSchema,
  days: z.array(weekdaySchema).optional(),
});
export const dateRangeParamsSchema = z.object({ from: dateStringSchema, to: dateStringSchema });

export const pricingRuleInputSchema = z
  .object({
    bookingMode: bookingModeSchema,
    ruleType: pricingRuleTypeSchema,
    params: z.record(z.unknown()),
    price: vndAmountSchema,
    priority: z.number().int().default(0),
  })
  .superRefine((rule, ctx) => {
    const schema =
      rule.ruleType === 'day_of_week'
        ? dayOfWeekParamsSchema
        : rule.ruleType === 'time_range'
          ? timeRangeParamsSchema
          : dateRangeParamsSchema;
    if (!schema.safeParse(rule.params).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['params'], message: `Invalid params for ruleType "${rule.ruleType}"` });
    }
  });
export type PricingRuleInput = z.infer<typeof pricingRuleInputSchema>;

export const quoteQuerySchema = z.object({
  mode: bookingModeSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  quantity: z.coerce.number().int().positive().default(1),
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

// ── Responses ──────────────────────────────────────────────────────────────

export const listingGroupResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  partnerId: z.string(),
  listingTypeId: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  workingArea: z.string().nullable(),
  amenities: z.array(z.string()),
  photos: z.array(z.string()),
  status: publishStatusSchema,
  publishedBy: moderationActorSchema.nullable(),
  hiddenBy: moderationActorSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ListingGroupResponse = z.infer<typeof listingGroupResponseSchema>;

export const listingResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  partnerId: z.string(),
  listingTypeId: z.string(),
  resourceId: z.string(),
  groupId: z.string().nullable(),
  categoryId: z.string().nullable(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  attributes: z.record(z.unknown()),
  bookingModes: z.array(bookingModeSchema),
  modeConfig: z.record(z.unknown()),
  stockQuantity: z.number().nullable(),
  capacity: z.number().nullable(),
  bufferBefore: z.number(),
  bufferAfter: z.number(),
  approvalRequired: z.boolean(),
  depositPercent: z.number(),
  balanceDue: balanceDueSchema,
  cancellationPolicyId: z.string().nullable(),
  status: publishStatusSchema,
  publishedBy: moderationActorSchema.nullable(),
  hiddenBy: moderationActorSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ListingResponse = z.infer<typeof listingResponseSchema>;

export const resourceResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  partnerId: z.string(),
  name: z.string(),
  timezone: z.string(),
  createdAt: z.string(),
});
export type ResourceResponse = z.infer<typeof resourceResponseSchema>;

export const pricingRuleResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  listingId: z.string(),
  bookingMode: bookingModeSchema,
  ruleType: pricingRuleTypeSchema,
  params: z.record(z.unknown()),
  price: z.string(),
  priority: z.number(),
  createdAt: z.string(),
});
export type PricingRuleResponse = z.infer<typeof pricingRuleResponseSchema>;

/**
 * Trust signals shown on the storefront before ratings exist (§16.1) — all
 * sourced from data already on hand at near-zero cost. Contact details are NOT
 * part of this: they are revealed to a customer only after a booking is
 * confirmed (§7.3 anti-disintermediation).
 */
export const trustSignalsSchema = z.object({
  /** Partner passed manual identity verification (drives the "verified" badge). */
  identityVerified: z.boolean(),
  /** ISO date the partner started on the tenant → "active since". */
  partnerActiveSince: z.string(),
  /** Public partner display name (never phone/email). */
  partnerName: z.string(),
  /** Count of completed bookings for this listing (0 until the booking module lands). */
  completedBookings: z.number(),
  /**
   * Average seconds a partner takes to approve a request-to-book booking on this
   * listing — the time from the booking's creation to its pending_approval →
   * pending_payment transition (§16.1). `null` when no approvals exist yet.
   */
  avgApprovalResponseSeconds: z.number().nullable(),
});
export type TrustSignals = z.infer<typeof trustSignalsSchema>;

/** Storefront listing detail (public) — enough to render the page + a quote form. */
export const publicListingDetailResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  attributes: z.record(z.unknown()),
  bookingModes: z.array(bookingModeSchema),
  modeConfig: z.record(z.unknown()),
  depositPercent: z.number(),
  listingTypeSlug: z.string(),
  trust: trustSignalsSchema,
});
export type PublicListingDetailResponse = z.infer<typeof publicListingDetailResponseSchema>;

export const quoteLineItemSchema = z.object({
  label: z.string(),
  quantity: z.number(),
  /** VND đồng digit strings. */
  unitPrice: z.string(),
  amount: z.string(),
  appliedRuleId: z.string().optional(),
  block: z.boolean().optional(),
});
export type QuoteLineItem = z.infer<typeof quoteLineItemSchema>;

export const quoteResponseSchema = z.object({
  currency: z.literal('VND'),
  mode: bookingModeSchema,
  subtotal: z.string(),
  depositAmount: z.string(),
  securityDeposit: z.string(),
  lineItems: z.array(quoteLineItemSchema),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

// ── Moderation (Task 1.5) ────────────────────────────────────────────────────

/** Optional reason attached to a hide/republish action, kept in the audit log. */
export const moderationReasonInputSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type ModerationReasonInput = z.infer<typeof moderationReasonInputSchema>;

/**
 * Publish input (§7.3). `force` lets a tenant reviewer **override the review gate**
 * (the failing checklist and the contact-info scan) and publish anyway — the
 * decision is recorded in the moderation audit log.
 */
export const publishListingInputSchema = z.object({
  force: z.boolean().default(false),
});
export type PublishListingInput = z.infer<typeof publishListingInputSchema>;

/** A piece of contact info detected in a listing's text at review time (§7.3). */
export const contactFlagSchema = z.object({
  type: z.enum(['phone', 'zalo', 'url', 'email']),
  /** The field it was found in, e.g. "description" or "title". */
  field: z.string(),
  /** The offending substring (for the reviewer to locate it). */
  match: z.string(),
});
export type ContactFlag = z.infer<typeof contactFlagSchema>;

export const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  passed: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/** What a tenant reviewer sees for a listing awaiting moderation. */
export const listingReviewResponseSchema = z.object({
  listingId: z.string(),
  status: publishStatusSchema,
  checklist: z.array(checklistItemSchema),
  checklistPassed: z.boolean(),
  /** Non-empty when the listing leaks contact info — publishing is blocked by policy. */
  contactFlags: z.array(contactFlagSchema),
});
export type ListingReviewResponse = z.infer<typeof listingReviewResponseSchema>;
