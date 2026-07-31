import { z } from 'zod';
import {
  cancellationTierSchema,
  paginationQuerySchema,
  uuidSchema,
  MAX_BULK_CALENDAR_DAYS,
} from './common';
import { slugSchema } from './tenancy';
import {
  attributeFieldSchema,
  bookingModeSchema,
  bookingSelectionSchema,
  listingTypeIconSchema,
  type BookingMode,
} from './listing-type';
import { partnerVerificationStatusSchema } from './partner';
import {
  administrativeAddressInputSchema,
  administrativeAddressSnapshotSchema,
} from './administrative-division';

/** VND đồng as a digit string — money never travels as a JS number. */
const vndAmountSchema = z.string().regex(/^\d+$/, 'Must be an integer VND amount in đồng');
const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24h)');
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');
const weekdaySchema = z.number().int().min(0).max(6); // 0=Sun … 6=Sat

export const publishStatusSchema = z.enum(['draft', 'pending_review', 'published', 'archived']);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const balanceDueSchema = z.enum(['online_before', 'on_arrival']);
export type BalanceDue = z.infer<typeof balanceDueSchema>;

/** Who performed a moderation action — a partner or an admin/tenant reviewer (§7.3). */
export const moderationActorSchema = z.enum(['partner', 'admin']);
export type ModerationActor = z.infer<typeof moderationActorSchema>;

export const pricingRuleTypeSchema = z.enum([
  'day_of_week',
  'time_range',
  'date_range',
  'date_time_range',
]);
export type PricingRuleType = z.infer<typeof pricingRuleTypeSchema>;

// ── mode_config (§7.3) ───────────────────────────────────────────────────────

const packageBaseSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  price: vndAmountSchema.refine((value) => BigInt(value) > 0n, 'Package price must be positive'),
  photos: z
    .array(z.string().url())
    .max(8, 'A package can have at most 8 photos')
    .refine((photos) => new Set(photos).size === photos.length, 'Package photos must be unique')
    .default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const hourlyPackageSchema = packageBaseSchema.extend({
  durationMinutes: z.number().int().positive(),
});
export type HourlyPackage = z.infer<typeof hourlyPackageSchema>;

export const dailyPackageSchema = packageBaseSchema.extend({
  durationDays: z.number().int().positive(),
});
export type DailyPackage = z.infer<typeof dailyPackageSchema>;

export const selectedPackageSchema = z.discriminatedUnion('mode', [
  hourlyPackageSchema.extend({ mode: z.literal('hourly') }),
  dailyPackageSchema.extend({ mode: z.literal('daily') }),
]);
export type SelectedPackage = z.infer<typeof selectedPackageSchema>;

function uniquePackageIds(packages: ReadonlyArray<{ id: string }>, ctx: z.RefinementCtx): void {
  const ids = packages.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['packages'],
      message: 'Package IDs must be unique within a booking mode',
    });
  }
}

export const hourlyModeConfigSchema = z
  .object({
    basePrice: vndAmountSchema.optional(),
    packages: z.array(hourlyPackageSchema).default([]),
    minDuration: z.number().int().positive().optional(),
    maxDuration: z.number().int().positive().optional(),
    granularity: z.number().int().positive().default(60),
    leadTimeMin: z.number().int().nonnegative().default(0),
  })
  .superRefine((c, ctx) => {
    if (
      c.maxDuration !== undefined &&
      c.minDuration !== undefined &&
      c.maxDuration < c.minDuration
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxDuration'],
        message: 'maxDuration must be ≥ minDuration',
      });
    }
    uniquePackageIds(c.packages, ctx);
    for (const [index, item] of c.packages.entries()) {
      if (item.durationMinutes % c.granularity !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['packages', index, 'durationMinutes'],
          message: 'Package duration must be a multiple of hourly granularity',
        });
      }
    }
  });

export const dailyModeConfigSchema = z
  .object({
    basePricePerNight: vndAmountSchema.optional(),
    packages: z.array(dailyPackageSchema).default([]),
    minNights: z.number().int().positive().optional(),
    maxNights: z.number().int().positive().optional(),
    checkinTime: timeStringSchema.default('14:00'),
    checkoutTime: timeStringSchema.default('12:00'),
    leadTimeMin: z.number().int().nonnegative().default(0),
  })
  .superRefine((c, ctx) => {
    if (c.maxNights !== undefined && c.minNights !== undefined && c.maxNights < c.minNights) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxNights'],
        message: 'maxNights must be ≥ minNights',
      });
    }
    uniquePackageIds(c.packages, ctx);
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

export const listingGroupAmenitySchema = z.object({
  label: z.string().trim().min(1).max(120),
  icon: listingTypeIconSchema,
});
export type ListingGroupAmenity = z.infer<typeof listingGroupAmenitySchema>;

export const listingGroupAmenitiesSchema = z
  .array(listingGroupAmenitySchema)
  .max(24)
  .superRefine((amenities, ctx) => {
    const labels = new Set<string>();
    for (const [index, amenity] of amenities.entries()) {
      const normalized = amenity.label.toLocaleLowerCase('vi');
      if (labels.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'label'],
          message: 'Amenity labels must be unique',
        });
      }
      labels.add(normalized);
    }
  });

export const createListingGroupInputSchema = z
  .object({
    partnerId: uuidSchema,
    listingTypeId: uuidSchema,
    title: z.string().min(1).max(200),
    /** Optional on create: the API generates a stable public slug when omitted. */
    slug: slugSchema.optional(),
    description: z.string().max(5000).optional(),
    workingArea: z.string().max(200).optional(),
    amenities: listingGroupAmenitiesSchema.default([]),
    photos: z.array(z.string().url()).default([]),
  })
  .merge(administrativeAddressInputSchema);
export type CreateListingGroupInput = z.infer<typeof createListingGroupInputSchema>;

export const updateListingGroupInputSchema = createListingGroupInputSchema.partial();
export type UpdateListingGroupInput = z.infer<typeof updateListingGroupInputSchema>;

const listingBaseSchema = z
  .object({
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
  })
  .merge(administrativeAddressInputSchema);

/** Each enabled mode must have matching mode_config; inventory needs stockQuantity. */
const modeConfigCoversModes = (
  value: { bookingModes?: BookingMode[]; modeConfig?: ModeConfig; stockQuantity?: number },
  ctx: z.RefinementCtx,
): void => {
  if (!value.bookingModes || !value.modeConfig) return;
  const config = value.modeConfig as Record<string, unknown>;
  for (const mode of value.bookingModes) {
    if (config[mode] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modeConfig'],
        message: `modeConfig.${mode} is required for enabled mode "${mode}"`,
      });
    }
  }
  if (value.bookingModes.includes('inventory') && value.stockQuantity === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stockQuantity'],
      message: 'stockQuantity is required for inventory mode',
    });
  }
};

export const createListingInputSchema = listingBaseSchema
  .extend({
    /** Optional on create: the API generates a stable public slug when omitted. */
    slug: slugSchema.optional(),
  })
  .superRefine(modeConfigCoversModes);
export type CreateListingInput = z.infer<typeof createListingInputSchema>;

export const depositRequirementResponseSchema = z.object({
  minimumDepositPercent: z.number().int().min(0).max(100).nullable(),
  commissionRuleId: uuidSchema.nullable(),
});
export type DepositRequirementResponse = z.infer<typeof depositRequirementResponseSchema>;

export const updateListingInputSchema = listingBaseSchema
  .partial()
  .superRefine(modeConfigCoversModes);
export type UpdateListingInput = z.infer<typeof updateListingInputSchema>;

export const createResourceInputSchema = z.object({
  partnerId: uuidSchema,
  name: z.string().min(1).max(200),
  // Optional — when omitted the server applies the tenant's own default_timezone
  // (not a hardcoded zone), so non-VN tenants get their configured zone.
  timezone: z.string().min(1).max(64).optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;

/**
 * Priority band per rule type — the single source of "which rule wins".
 *
 * The quote calculator sorts matching rules by `priority` descending and takes
 * the first ([quote-calculator.ts] `matchingRule`), so **a higher number wins**.
 * The bands go up as the rule gets narrower, which is the only ordering that
 * behaves the way an operator expects: a recurring weekend price is the
 * baseline, a season override beats it, and a price set on one specific
 * date+window beats everything. Never write a raw priority at a call site —
 * that is how the three surfaces drifted to 0 / 10 / 1000 before this existed.
 */
export const PRICING_RULE_PRIORITY = {
  /** `day_of_week`, `time_range` — repeats forever, so it is the floor. */
  recurring: 100,
  /** `date_range` — an override covering a span of dates. */
  dateRange: 500,
  /** `date_time_range` — the narrowest scope, so it outranks all of them. */
  dateTimeRange: 1000,
} as const;

export const dayOfWeekParamsSchema = z.object({ days: z.array(weekdaySchema).min(1) });
export const timeRangeParamsSchema = z.object({
  from: timeStringSchema,
  to: timeStringSchema,
  days: z.array(weekdaySchema).optional(),
});
export const dateRangeParamsSchema = z.object({ from: dateStringSchema, to: dateStringSchema });
export const dateTimeRangeParamsSchema = z
  .object({
    date: dateStringSchema,
    from: timeStringSchema,
    to: timeStringSchema,
  })
  .refine((value) => value.from < value.to, {
    path: ['to'],
    message: 'to must be after from',
  });

/**
 * Campaign fields shared by every shape that can carry a sale. The window is
 * measured at BOOKING time and bounds the sale only — the rule keeps applying
 * its regular `price` outside it.
 */
export const saleCampaignFields = {
  saleStartsAt: z.string().datetime().optional(),
  saleEndsAt: z.string().datetime().optional(),
  campaignLabel: z.string().trim().min(1).max(80).optional(),
};

/** A campaign is meaningless without a sale, and must not end before it starts. */
function refineSaleCampaign(
  rule: { salePrice?: string; saleStartsAt?: string; saleEndsAt?: string; campaignLabel?: string },
  ctx: z.RefinementCtx,
): void {
  const hasCampaign = Boolean(rule.saleStartsAt ?? rule.saleEndsAt ?? rule.campaignLabel);
  if (hasCampaign && !rule.salePrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['salePrice'],
      message: 'A campaign needs a sale price',
    });
  }
  if (rule.saleStartsAt && rule.saleEndsAt && rule.saleStartsAt >= rule.saleEndsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['saleEndsAt'],
      message: 'Campaign must end after it starts',
    });
  }
}

export const pricingRuleInputSchema = z
  .object({
    bookingMode: bookingModeSchema,
    ruleType: pricingRuleTypeSchema,
    params: z.record(z.unknown()),
    price: vndAmountSchema,
    salePrice: vndAmountSchema.optional(),
    ...saleCampaignFields,
    priority: z.number().int().default(0),
  })
  .superRefine((rule, ctx) => {
    refineSaleCampaign(rule, ctx);
    const schema =
      rule.ruleType === 'day_of_week'
        ? dayOfWeekParamsSchema
        : rule.ruleType === 'time_range'
          ? timeRangeParamsSchema
          : rule.ruleType === 'date_range'
            ? dateRangeParamsSchema
            : dateTimeRangeParamsSchema;
    if (!schema.safeParse(rule.params).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['params'],
        message: `Invalid params for ruleType "${rule.ruleType}"`,
      });
    }
    if (rule.salePrice !== undefined && BigInt(rule.salePrice) >= BigInt(rule.price)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salePrice'],
        message: 'Sale price must be lower than regular price',
      });
    }
  });
export type PricingRuleInput = z.infer<typeof pricingRuleInputSchema>;

/**
 * Apply one price across a span of calendar dates in a single write — the
 * calendar's "select a range" action (§7.3).
 *
 * `daily` collapses to ONE `date_range` rule covering the whole span, because
 * the quote calculator already matches a date against `[from, to]`. `hourly`
 * needs `window` and expands to one `date_time_range` rule per date, since an
 * hourly rule is scoped to a single date's clock window.
 */
export const pricingRuleRangeInputSchema = z
  .object({
    bookingMode: bookingModeSchema,
    dateFrom: dateStringSchema,
    dateTo: dateStringSchema,
    /** Clock window inside each date. Required for `hourly`, ignored for `daily`. */
    window: z.object({ from: timeStringSchema, to: timeStringSchema }).optional(),
    price: vndAmountSchema,
    salePrice: vndAmountSchema.optional(),
    ...saleCampaignFields,
    priority: z.number().int().default(0),
  })
  .superRefine((rule, ctx) => {
    refineSaleCampaign(rule, ctx);
    if (rule.dateTo < rule.dateFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: 'dateTo must be on/after dateFrom',
      });
    } else {
      const days =
        (Date.parse(`${rule.dateTo}T00:00:00Z`) - Date.parse(`${rule.dateFrom}T00:00:00Z`)) /
          86_400_000 +
        1;
      if (days > MAX_BULK_CALENDAR_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateTo'],
          message: `Range must be at most ${MAX_BULK_CALENDAR_DAYS} days`,
        });
      }
    }
    if (rule.bookingMode === 'hourly') {
      if (!rule.window) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['window'],
          message: 'window is required for hourly pricing',
        });
      } else if (rule.window.from >= rule.window.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['window', 'to'],
          message: 'to must be after from',
        });
      }
    }
    if (rule.salePrice !== undefined && BigInt(rule.salePrice) >= BigInt(rule.price)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salePrice'],
        message: 'Sale price must be lower than regular price',
      });
    }
  });
export type PricingRuleRangeInput = z.infer<typeof pricingRuleRangeInputSchema>;

/** Why a date in a bulk range received no rule. */
export const pricingRuleSkipReasonSchema = z.enum(['closed', 'outside_open_hours', 'overlap']);
export type PricingRuleSkipReason = z.infer<typeof pricingRuleSkipReasonSchema>;

export const recurringPricingKindSchema = z.enum(['day_of_week', 'time_range']);
export type RecurringPricingKind = z.infer<typeof recurringPricingKindSchema>;

/**
 * The form shape for a repeating price, translated into a `pricingRuleInput`
 * (params + `PRICING_RULE_PRIORITY.recurring`) before it reaches the API.
 *
 * `days` is always explicit here even though `timeRangeParamsSchema` allows it
 * to be absent: "every weekday" and "the weekdays I picked" must not be the
 * same edit, or a partner who clears the selection silently widens the rule to
 * the whole week.
 */
export const recurringPricingRuleInputSchema = z
  .object({
    bookingMode: bookingModeSchema,
    kind: recurringPricingKindSchema,
    days: z.array(weekdaySchema).min(1, 'Chọn ít nhất một thứ trong tuần'),
    window: z.object({ from: timeStringSchema, to: timeStringSchema }).optional(),
    price: vndAmountSchema,
    salePrice: vndAmountSchema.optional(),
    ...saleCampaignFields,
  })
  .superRefine((rule, ctx) => {
    refineSaleCampaign(rule, ctx);
    if (rule.kind === 'time_range') {
      if (!rule.window) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['window'],
          message: 'Khung giờ là bắt buộc',
        });
      } else if (rule.window.from >= rule.window.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['window', 'to'],
          message: 'Giờ kết thúc phải sau giờ bắt đầu',
        });
      }
    }
    if (rule.salePrice !== undefined && BigInt(rule.salePrice) >= BigInt(rule.price)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salePrice'],
        message: 'Sale price must be lower than regular price',
      });
    }
  });
export type RecurringPricingRuleInput = z.infer<typeof recurringPricingRuleInputSchema>;

export const quoteQuerySchema = z.object({
  mode: bookingModeSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  quantity: z.coerce.number().int().positive().default(1),
  packageId: uuidSchema.optional(),
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

/** `GET /tenant/listings` — paginated; `groupId` narrows to one post's items. */
export const listTenantListingsQuerySchema = paginationQuerySchema.extend({
  groupId: uuidSchema.optional(),
  status: publishStatusSchema.optional(),
  /** Case-insensitive search over the listing title. Applied to items + counts. */
  q: z.string().trim().max(200).optional(),
});
export type ListTenantListingsQuery = z.infer<typeof listTenantListingsQuerySchema>;

/** `GET /partner/listings` — paginated; always scoped to the calling partner. */
export const listPartnerListingsQuerySchema = paginationQuerySchema
  .extend({
    groupId: uuidSchema.optional(),
    /** Management-list only: exclude child listings that belong to a group. */
    standaloneOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    listingTypeId: uuidSchema.optional(),
    status: publishStatusSchema.optional(),
    /**
     * Every listing sharing one resource's calendar. Availability is
     * resource-scoped, so a screen changing opening hours uses this to tell the
     * partner which other listings the change reaches.
     */
    resourceId: uuidSchema.optional(),
    /** Case-insensitive search over the listing title. Applied to items + counts. */
    q: z.string().trim().max(200).optional(),
  })
  .refine((query) => !(query.groupId && query.standaloneOnly), {
    message: 'groupId and standaloneOnly cannot be combined',
    path: ['standaloneOnly'],
  });
export type ListPartnerListingsQuery = z.infer<typeof listPartnerListingsQuerySchema>;

/**
 * `GET /partner/listings/feed` — a single paginated management feed that
 * interleaves standalone listings with listing groups.
 */
export const listPartnerListingFeedQuerySchema = paginationQuerySchema.extend({
  listingTypeId: uuidSchema.optional(),
  status: publishStatusSchema.optional(),
  /** Case-insensitive search over a standalone listing or listing-group title. */
  q: z.string().trim().max(200).optional(),
});
export type ListPartnerListingFeedQuery = z.infer<typeof listPartnerListingFeedQuerySchema>;

/** `GET /tenant/listing-groups` — paginated; case-insensitive search over the group title. */
export const listListingGroupsQuerySchema = paginationQuerySchema.extend({
  listingTypeId: uuidSchema.optional(),
  status: publishStatusSchema.optional(),
  /** Case-insensitive search over the listing-group title. */
  q: z.string().trim().max(200).optional(),
});
export type ListListingGroupsQuery = z.infer<typeof listListingGroupsQuerySchema>;

// ── Responses ──────────────────────────────────────────────────────────────

export const cancellationPolicySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  rules: z.array(cancellationTierSchema),
});
export type CancellationPolicySummary = z.infer<typeof cancellationPolicySummarySchema>;

/** Where the policy governing a listing came from after fallback resolution. */
export const cancellationPolicySourceSchema = z.enum(['listing', 'partner', 'tenant']);
export type CancellationPolicySource = z.infer<typeof cancellationPolicySourceSchema>;

// ── Partner-managed cancellation policies (CRUD) ─────────────────────────────

/** Refund tiers as accepted from a partner form (stricter than the shared snapshot shape). */
const cancellationTierInputSchema = z.object({
  hoursBefore: z.number().int().min(0),
  refundPercent: z.number().int().min(0).max(100),
});

export const createCancellationPolicyInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rules: z.array(cancellationTierInputSchema).min(1),
});
export type CreateCancellationPolicyInput = z.infer<typeof createCancellationPolicyInputSchema>;

export const updateCancellationPolicyInputSchema = createCancellationPolicyInputSchema.partial();
export type UpdateCancellationPolicyInput = z.infer<typeof updateCancellationPolicyInputSchema>;

/** Full policy row returned to the partner management screen. */
export const cancellationPolicyResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  /** null ⇒ tenant-level shared policy; set ⇒ owned by this partner. */
  partnerId: z.string().nullable(),
  name: z.string(),
  rules: z.array(cancellationTierSchema),
  /** True when this is the caller partner's default policy. */
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CancellationPolicyResponse = z.infer<typeof cancellationPolicyResponseSchema>;

/** Body of `PATCH …/default-cancellation-policy` (partner + tenant); null clears the default. */
export const setDefaultCancellationPolicyInputSchema = z.object({
  policyId: uuidSchema.nullable(),
});
export type SetDefaultCancellationPolicyInput = z.infer<
  typeof setDefaultCancellationPolicyInputSchema
>;

/**
 * The partner a listing belongs to, as a reviewer needs to see them. Name +
 * verification state only — a partner's phone/email is never embedded in a
 * listing payload (§7.3 anti-disintermediation).
 */
export const listingPartnerSummarySchema = z.object({
  name: z.string(),
  verificationStatus: partnerVerificationStatusSchema,
});
export type ListingPartnerSummary = z.infer<typeof listingPartnerSummarySchema>;

export const listingGroupResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    partnerId: z.string(),
    listingTypeId: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    workingArea: z.string().nullable(),
    amenities: listingGroupAmenitiesSchema,
    photos: z.array(z.string()),
    status: publishStatusSchema,
    publishedBy: moderationActorSchema.nullable(),
    hiddenBy: moderationActorSchema.nullable(),
    /** Items in this post. */
    listingCount: z.number().int().nonnegative(),
    /** Items that would pass the submission checklist (photo + description + price). */
    readyListingCount: z.number().int().nonnegative(),
    /** Lowest configured base price across the post's items (VND đồng digit string). */
    priceFrom: z.string().nullable(),
    /** Mean review score, 1–5 with 2 decimals; null until the post has ratings. */
    ratingAvg: z.number().nullable(),
    reviewCount: z.number().int().nonnegative(),
    bookingCount: z.number().int().nonnegative(),
    favoriteCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .merge(administrativeAddressSnapshotSchema);
export type ListingGroupResponse = z.infer<typeof listingGroupResponseSchema>;

export const listingResponseSchema = z
  .object({
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
    bookingSelection: bookingSelectionSchema,
    modeConfig: z.record(z.unknown()),
    stockQuantity: z.number().nullable(),
    capacity: z.number().nullable(),
    bufferBefore: z.number(),
    bufferAfter: z.number(),
    approvalRequired: z.boolean(),
    depositPercent: z.number(),
    balanceDue: balanceDueSchema,
    rescheduleAllowed: z.boolean(),
    /** Cut-off before start, in hours; null = no deadline. */
    rescheduleDeadlineHours: z.number().nullable(),
    /** VND đồng digit string; null = free. */
    rescheduleFee: vndAmountSchema.nullable(),
    cancellationPolicyId: z.string().nullable(),
    /**
     * The resolved policy behind `cancellationPolicyId`. The storefront has always
     * received this; a tenant reviewer deciding whether to approve the listing
     * needs the same rules in front of them, not just an opaque id.
     */
    cancellationPolicy: cancellationPolicySummarySchema.nullable(),
    /**
     * The policy that actually governs this listing after the fallback chain
     * (listing → partner default → tenant default); null when none applies. Read this
     * for display; `cancellationPolicy` is only the listing's own explicit choice.
     */
    effectiveCancellationPolicy: cancellationPolicySummarySchema.nullable(),
    /** Origin of `effectiveCancellationPolicy`; null when no policy applies. */
    effectiveCancellationPolicySource: cancellationPolicySourceSchema.nullable(),
    partner: listingPartnerSummarySchema,
    ratingAvg: z.number().nullable(),
    reviewCount: z.number().int().nonnegative(),
    /** Completed bookings shown on management list surfaces. */
    bookingCount: z.number().int().nonnegative(),
    favoriteCount: z.number().int().nonnegative(),
    status: publishStatusSchema,
    publishedBy: moderationActorSchema.nullable(),
    hiddenBy: moderationActorSchema.nullable(),
    /** Set when the listing entered `pending_review`; null while still a draft. */
    submittedAt: z.string().nullable(),
    /** Set when the listing FIRST reached `published`; survives a later hide. */
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .merge(administrativeAddressSnapshotSchema);
export type ListingResponse = z.infer<typeof listingResponseSchema>;

/** A row in the partner listing management feed. */
export const partnerListingFeedItemResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), item: listingResponseSchema }),
  z.object({ kind: z.literal('grouped'), item: listingGroupResponseSchema }),
]);
export type PartnerListingFeedItemResponse = z.infer<typeof partnerListingFeedItemResponseSchema>;

export const listingGroupDetailResponseSchema = listingGroupResponseSchema.extend({
  listings: z.array(listingResponseSchema),
  itemLabel: z.string(),
});
export type ListingGroupDetailResponse = z.infer<typeof listingGroupDetailResponseSchema>;

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
  salePrice: z.string().nullable(),
  /** Campaign window for `salePrice`, half-open `[start, end)` at booking time. */
  saleStartsAt: z.string().nullable(),
  saleEndsAt: z.string().nullable(),
  campaignLabel: z.string().nullable(),
  priority: z.number(),
  createdAt: z.string(),
});
export type PricingRuleResponse = z.infer<typeof pricingRuleResponseSchema>;

/**
 * Outcome of a bulk range write. A range almost always straddles days the
 * listing does not sell, so unsellable dates are reported as `skipped` rather
 * than failing the whole write — the caller shows "applied to 22 of 30 days".
 */
export const pricingRuleBulkResultSchema = z.object({
  created: z.array(pricingRuleResponseSchema),
  skipped: z.array(z.object({ date: dateStringSchema, reason: pricingRuleSkipReasonSchema })),
});
export type PricingRuleBulkResult = z.infer<typeof pricingRuleBulkResultSchema>;

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
  /** Stable public storefront route key. */
  partnerSlug: z.string(),
  /** Optional public logo from the partner business profile. */
  partnerLogoUrl: z.string().url().nullable(),
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
export const publicListingDetailResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    photos: z.array(z.string()),
    attributes: z.record(z.unknown()),
    /** The listing type's attribute definitions (label + icon + type + order) so
     * the storefront renders icon-led spec cards, not humanized keys. */
    attributeSchema: z.array(attributeFieldSchema).default([]),
    bookingModes: z.array(bookingModeSchema),
    bookingSelection: bookingSelectionSchema,
    modeConfig: z.record(z.unknown()),
    capacity: z.number().int().positive().nullable(),
    depositPercent: z.number(),
    listingTypeSlug: z.string(),
    group: z.object({ title: z.string(), slug: z.string() }).nullable(),
    cancellationPolicy: cancellationPolicySummarySchema.nullable(),
    /** Policy actually applied after fallback (listing → partner default → tenant default). */
    effectiveCancellationPolicy: cancellationPolicySummarySchema.nullable(),
    effectiveCancellationPolicySource: cancellationPolicySourceSchema.nullable(),
    trust: trustSignalsSchema,
    ratingAvg: z.number().nullable(),
    reviewCount: z.number().int().nonnegative(),
  })
  .merge(administrativeAddressSnapshotSchema);
export type PublicListingDetailResponse = z.infer<typeof publicListingDetailResponseSchema>;

export const publicListingGroupDetailResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    workingArea: z.string().nullable(),
    amenities: listingGroupAmenitiesSchema,
    photos: z.array(z.string()),
    listingTypeSlug: z.string(),
    /** The listing type's attribute definitions, shared by every child listing. */
    attributeSchema: z.array(attributeFieldSchema).default([]),
    bookingSelection: bookingSelectionSchema,
    itemLabel: z.string(),
    ratingAvg: z.number().nullable(),
    reviewCount: z.number().int().nonnegative(),
    trust: trustSignalsSchema,
    listings: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        slug: z.string(),
        description: z.string().nullable(),
        photos: z.array(z.string()),
        attributes: z.record(z.unknown()),
        capacity: z.number().int().positive().nullable(),
        bookingModes: z.array(bookingModeSchema),
        priceFrom: z.string().nullable(),
        ratingAvg: z.number().nullable(),
        reviewCount: z.number().int().nonnegative(),
      }),
    ),
  })
  .merge(administrativeAddressSnapshotSchema);
export type PublicListingGroupDetailResponse = z.infer<
  typeof publicListingGroupDetailResponseSchema
>;

export const quoteLineItemSchema = z.object({
  label: z.string(),
  quantity: z.number(),
  /** VND đồng digit strings. */
  unitPrice: z.string(),
  regularUnitPrice: z.string(),
  amount: z.string(),
  regularAmount: z.string(),
  appliedRuleId: z.string().optional(),
  /** Present only when a named sale campaign discounted this line. */
  campaignLabel: z.string().optional(),
  block: z.boolean().optional(),
});
export type QuoteLineItem = z.infer<typeof quoteLineItemSchema>;

export const quoteResponseSchema = z.object({
  currency: z.literal('VND'),
  mode: bookingModeSchema,
  subtotal: z.string(),
  regularSubtotal: z.string(),
  savingsAmount: z.string(),
  depositAmount: z.string(),
  securityDeposit: z.string(),
  lineItems: z.array(quoteLineItemSchema),
  selectedPackage: selectedPackageSchema.optional(),
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

/** `POST /partner/listings/:id/submit` — updated listing plus its review checklist. */
export const submitListingResponseSchema = z.object({
  listing: listingResponseSchema,
  review: listingReviewResponseSchema,
});
export type SubmitListingResponse = z.infer<typeof submitListingResponseSchema>;

/**
 * What a tenant reviewer sees for a **post** (listing_group) awaiting moderation
 * — the group-level mirror of `listingReviewResponseSchema`.
 *
 * Publishing a group publishes every child listing with it, so the checklist and
 * the contact scan both cover the children: `contactFlags` aggregates the group's
 * own text AND each child's, and a child's flags are namespaced in `field` (e.g.
 * `listings[0].description`) so the reviewer can find the offending item.
 */
export const listingGroupReviewResponseSchema = z.object({
  groupId: z.string(),
  status: publishStatusSchema,
  checklist: z.array(checklistItemSchema),
  checklistPassed: z.boolean(),
  contactFlags: z.array(contactFlagSchema),
  /** Per-child review, in the same order as the post's items. */
  listings: z.array(listingReviewResponseSchema),
});
export type ListingGroupReviewResponse = z.infer<typeof listingGroupReviewResponseSchema>;

// ── Edit revisions ───────────────────────────────────────────────────────────

/**
 * Editing an already-reviewed listing does not touch the live row: the change is
 * parked as a **revision** and only written onto the listing when a tenant
 * reviewer approves it (§7.3). A draft that has never been reviewed is still
 * edited in place — there is nothing published to protect yet.
 */
export const revisionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'discarded']);
export type RevisionStatus = z.infer<typeof revisionStatusSchema>;

export const revisionTargetSchema = z.enum(['listing', 'listing_group']);
export type RevisionTarget = z.infer<typeof revisionTargetSchema>;

/** Which part of the edit form a changed field belongs to — drives the reviewer's grouping. */
export const revisionDiffSectionSchema = z.enum(['content', 'pricing', 'location', 'policy']);
export type RevisionDiffSection = z.infer<typeof revisionDiffSectionSchema>;

/**
 * One changed field. `before`/`after` carry the raw values (string, number,
 * boolean, string[], or a nested object for `attributes`/`modeConfig`) so the
 * reviewer UI can render each field type in its own way.
 */
export const revisionDiffEntrySchema = z.object({
  field: z.string(),
  section: revisionDiffSectionSchema,
  before: z.unknown(),
  after: z.unknown(),
});
export type RevisionDiffEntry = z.infer<typeof revisionDiffEntrySchema>;

export const listingRevisionResponseSchema = z.object({
  id: uuidSchema,
  targetType: revisionTargetSchema,
  targetId: uuidSchema,
  /** Title of the edited listing/post at read time — for post-level review lists. */
  targetTitle: z.string(),
  status: revisionStatusSchema,
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  appliedAt: z.string().nullable(),
  /** Only the fields that actually differ from the live record. */
  diff: z.array(revisionDiffEntrySchema),
});
export type ListingRevisionResponse = z.infer<typeof listingRevisionResponseSchema>;

/**
 * Every pending change on a post, reviewed as one unit (§7.3 — posts are
 * moderated at the post level): the group's own revision plus one per edited item.
 */
export const listingGroupPendingChangesResponseSchema = z.object({
  groupId: uuidSchema,
  group: listingRevisionResponseSchema.nullable(),
  listings: z.array(listingRevisionResponseSchema),
});
export type ListingGroupPendingChangesResponse = z.infer<
  typeof listingGroupPendingChangesResponseSchema
>;

/** A reviewer must say why a change was turned down — the partner sees this note. */
export const rejectRevisionInputSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});
export type RejectRevisionInput = z.infer<typeof rejectRevisionInputSchema>;
