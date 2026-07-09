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

export interface ListingGroupResponse {
  id: string;
  tenantId: string;
  partnerId: string;
  listingTypeId: string;
  title: string;
  slug: string;
  description: string | null;
  address: string | null;
  workingArea: string | null;
  amenities: string[];
  photos: string[];
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingResponse {
  id: string;
  tenantId: string;
  partnerId: string;
  listingTypeId: string;
  resourceId: string;
  groupId: string | null;
  categoryId: string | null;
  title: string;
  slug: string;
  description: string | null;
  photos: string[];
  attributes: Record<string, unknown>;
  bookingModes: BookingMode[];
  modeConfig: Record<string, unknown>;
  stockQuantity: number | null;
  capacity: number | null;
  bufferBefore: number;
  bufferAfter: number;
  approvalRequired: boolean;
  depositPercent: number;
  balanceDue: BalanceDue;
  cancellationPolicyId: string | null;
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceResponse {
  id: string;
  tenantId: string;
  partnerId: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface PricingRuleResponse {
  id: string;
  tenantId: string;
  listingId: string;
  bookingMode: BookingMode;
  ruleType: PricingRuleType;
  params: Record<string, unknown>;
  price: string;
  priority: number;
  createdAt: string;
}

/**
 * Trust signals shown on the storefront before ratings exist (§16.1) — all
 * sourced from data already on hand at near-zero cost. Contact details are NOT
 * part of this: they are revealed to a customer only after a booking is
 * confirmed (§7.3 anti-disintermediation).
 */
export interface TrustSignals {
  /** Partner passed manual identity verification (drives the "verified" badge). */
  identityVerified: boolean;
  /** ISO date the partner started on the tenant → "active since". */
  partnerActiveSince: string;
  /** Public partner display name (never phone/email). */
  partnerName: string;
  /** Count of completed bookings for this listing (0 until the booking module lands). */
  completedBookings: number;
}

/** Storefront listing detail (public) — enough to render the page + a quote form. */
export interface PublicListingDetailResponse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  photos: string[];
  attributes: Record<string, unknown>;
  bookingModes: BookingMode[];
  modeConfig: Record<string, unknown>;
  depositPercent: number;
  listingTypeSlug: string;
  trust: TrustSignals;
}

export interface QuoteLineItem {
  label: string;
  quantity: number;
  /** VND đồng digit strings. */
  unitPrice: string;
  amount: string;
  appliedRuleId?: string;
  block?: boolean;
}

export interface QuoteResponse {
  currency: 'VND';
  mode: BookingMode;
  subtotal: string;
  depositAmount: string;
  securityDeposit: string;
  lineItems: QuoteLineItem[];
}

// ── Moderation (Task 1.5) ────────────────────────────────────────────────────

/** Optional reason attached to a hide/republish action, kept in the audit log. */
export const moderationReasonInputSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type ModerationReasonInput = z.infer<typeof moderationReasonInputSchema>;

/** A piece of contact info detected in a listing's text at review time (§7.3). */
export interface ContactFlag {
  type: 'phone' | 'zalo' | 'url' | 'email';
  /** The field it was found in, e.g. "description" or "title". */
  field: string;
  /** The offending substring (for the reviewer to locate it). */
  match: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
}

/** What a tenant reviewer sees for a listing awaiting moderation. */
export interface ListingReviewResponse {
  listingId: string;
  status: PublishStatus;
  checklist: ChecklistItem[];
  checklistPassed: boolean;
  /** Non-empty when the listing leaks contact info — publishing is blocked by policy. */
  contactFlags: ContactFlag[];
}
