import { z } from 'zod';
import { localeSchema, paginationQuerySchema, uuidSchema } from './common';

/** Storefront base template (TONG-QUAN.md §16.1) — independent of listing modes. */
export const verticalSchema = z.enum(['studio', 'rental', 'classes']);
export type Vertical = z.infer<typeof verticalSchema>;

export const tenantStatusSchema = z.enum(['active', 'suspended', 'expired']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const subscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'expired',
  'cancelled',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** URL-safe slug: lowercase alphanumerics separated by single hyphens. */
export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase letters, digits and single hyphens');

/** A hostname without scheme or port, e.g. `studiohub.vn`. */
export const hostnameSchema = z
  .string()
  .min(3)
  .max(253)
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/, 'Invalid hostname');

/** subscription_plans.limits (§6.5). Money-free feature caps + module toggles. */
export const planLimitsSchema = z.object({
  maxPartners: z.number().int().nonnegative(),
  maxListings: z.number().int().nonnegative(),
  maxBookingsPerMonth: z.number().int().nonnegative(),
  customDomain: z.boolean(),
  affiliateModule: z.boolean(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

// ── Inputs (validated identically on FE + BE) ────────────────────────────────

export const createTenantInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
  vertical: verticalSchema.default('studio'),
  defaultTimezone: z.string().min(1).max(64).default('Asia/Ho_Chi_Minh'),
  defaultLocale: localeSchema.default('vi'),
});
export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;

export const updateTenantInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    vertical: verticalSchema,
    defaultTimezone: z.string().min(1).max(64),
    defaultLocale: localeSchema,
    status: tenantStatusSchema,
    themeConfig: z.record(z.unknown()),
    settings: z.record(z.unknown()),
  })
  .partial();
export type UpdateTenantInput = z.infer<typeof updateTenantInputSchema>;

/**
 * `GET /admin/tenants` query. Every filter is optional and ANDed; `search` matches
 * the tenant name or slug (case-insensitive, partial).
 */
export const listTenantsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  status: tenantStatusSchema.optional(),
  vertical: verticalSchema.optional(),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;

/** Tenant toggle for partner-created promotions (§12.2). */
export const partnerPromotionsToggleSchema = z.object({ partnerPromotionsEnabled: z.boolean() });
export type PartnerPromotionsToggle = z.infer<typeof partnerPromotionsToggleSchema>;

export const createPlanInputSchema = z.object({
  name: z.string().min(1).max(120),
  /** VND đồng as a digit string (money never travels as a JS number). */
  priceMonthly: z.string().regex(/^\d+$/, 'Must be an integer amount in VND đồng'),
  limits: planLimitsSchema,
  isActive: z.boolean().default(true),
});
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;

/**
 * `PATCH /admin/plans/:id`. Every field is optional — a plan is created before its
 * price is necessarily final and `name` is UNIQUE, so without this a typo is
 * permanent (the plan can be neither corrected nor recreated under the same name).
 *
 * `repriceExistingSubscribers` is a blast-radius acknowledgement, not a setting:
 * `tenant_subscriptions` stores only a `plan_id` and reads `price_monthly` through
 * that FK, so it holds **no price snapshot** — editing a plan's price silently
 * re-prices every tenant already on it. The API therefore rejects a price change on
 * a plan with live subscribers (409 `PLAN_HAS_SUBSCRIBERS`) unless this is `true`.
 * Correcting a typo on a not-yet-sold plan — the common case — needs no flag.
 */
export const updatePlanInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    /** VND đồng as a digit string (money never travels as a JS number). */
    priceMonthly: z.string().regex(/^\d+$/, 'Must be an integer amount in VND đồng'),
    limits: planLimitsSchema,
    isActive: z.boolean(),
    repriceExistingSubscribers: z.boolean(),
  })
  .partial();
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;

export const assignSubscriptionInputSchema = z.object({
  planId: uuidSchema,
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime(),
  status: subscriptionStatusSchema.default('active'),
  note: z.string().max(1000).optional(),
});
export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionInputSchema>;

export const addDomainInputSchema = z.object({
  hostname: hostnameSchema,
  isPrimary: z.boolean().default(false),
});
export type AddDomainInput = z.infer<typeof addDomainInputSchema>;

// ── Storefront theme config (§16.1 / §16.2) ──────────────────────────────────

/**
 * A URL field that also accepts a blank string (meaning "not set"). Kept free of
 * `.transform()`/`.default()` so the schema's input and output types match — this
 * lets it drive a `GenericForm` and re-validate identically in the route action.
 */
const themeUrl = z.string().url({ message: 'Phải là một URL hợp lệ' }).or(z.literal(''));
/** An email field that also accepts a blank string. */
const themeEmail = z.string().email({ message: 'Email không hợp lệ' }).or(z.literal(''));

/**
 * Storefront `theme_config` shape (§16.2). Every field is optional so a partially
 * configured tenant still validates; URL/email fields additionally accept a blank
 * string. Colors are free-form tokens (hex or CSS values). No `.default()` /
 * `.transform()` — input and output types are identical, so the tenant settings
 * form validates client-side and re-validates in the action with this same schema.
 */
export const themeConfigSchema = z.object({
  logoUrl: themeUrl.optional(),
  faviconUrl: themeUrl.optional(),
  colors: z
    .object({
      primary: z.string().max(64).optional(),
      accent: z.string().max(64).optional(),
      background: z.string().max(64).optional(),
    })
    .optional(),
  font: z.string().max(80).optional(),
  hero: z
    .object({
      title: z.string().max(200).optional(),
      subtitle: z.string().max(500).optional(),
      imageUrl: themeUrl.optional(),
    })
    .optional(),
  /**
   * Homepage carousel images (§16.2) — an ordered list of image URLs shown as
   * rotating slides on the storefront home. Capped at 10 to keep the hero light.
   * A plain URL array (not captioned objects) so it maps to a single multi-file
   * upload field in the tenant settings GenericForm.
   */
  carousel: z.array(themeUrl).max(10).optional(),
  contact: z
    .object({
      email: themeEmail.optional(),
      phone: z.string().max(40).optional(),
      address: z.string().max(500).optional(),
    })
    .optional(),
  seo: z
    .object({
      title: z.string().max(200).optional(),
      description: z.string().max(500).optional(),
    })
    .optional(),
  socialLinks: z
    .object({
      facebook: themeUrl.optional(),
      instagram: themeUrl.optional(),
      tiktok: themeUrl.optional(),
      youtube: themeUrl.optional(),
    })
    .optional(),
});
export type ThemeConfigInput = z.infer<typeof themeConfigSchema>;

/**
 * The tenant-brand subset used by authenticated dashboard shells. It is derived
 * from the same theme schema as the storefront, so dashboard consumers never
 * invent a second shape for logo, colors, or typography.
 */
export const dashboardBrandConfigSchema = themeConfigSchema.pick({
  logoUrl: true,
  faviconUrl: true,
  colors: true,
  font: true,
});
export type DashboardBrandConfig = z.infer<typeof dashboardBrandConfigSchema>;

/** The storefront theme payload the dashboard reads back to hydrate its form (§16.1). */
export const tenantThemeResponseSchema = z.object({
  name: z.string(),
  vertical: verticalSchema,
  defaultLocale: localeSchema,
  themeConfig: themeConfigSchema,
});
export type TenantThemeResponse = z.infer<typeof tenantThemeResponseSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

/**
 * A tenant as configured. `themeConfig`/`settings` are writable through
 * {@link updateTenantInputSchema}, so they are readable here too — an admin must be
 * able to read back what it just wrote. Joins/aggregates (subscription, domains,
 * counts) live on {@link tenantDetailResponseSchema} instead, so the paginated list
 * stays one query.
 */
export const tenantResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: tenantStatusSchema,
  vertical: verticalSchema,
  defaultTimezone: z.string(),
  defaultLocale: localeSchema,
  themeConfig: z.record(z.unknown()),
  settings: z.record(z.unknown()),
  /** Tenant-level fallback cancellation policy (§11.3); null = no tenant default. */
  defaultCancellationPolicyId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantResponse = z.infer<typeof tenantResponseSchema>;

export const planResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** VND đồng as a digit string. */
  priceMonthly: z.string(),
  limits: planLimitsSchema,
  isActive: z.boolean(),
  /**
   * Tenants whose *current* subscription is on this plan and is still within its
   * paid-through date (§6.5 `trial`/`active`/`past_due`). Deduped per tenant:
   * assigning a plan appends a `tenant_subscriptions` row and never retires the
   * previous one, so counting rows would count every renewal as another subscriber.
   */
  subscriberCount: z.number().int().nonnegative(),
  /**
   * Monthly recurring revenue this plan earns the platform, in VND đồng as a digit
   * string — `subscriberCount × priceMonthly`, computed with bigint.
   */
  mrr: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

export const subscriptionResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  planId: z.string(),
  status: subscriptionStatusSchema,
  startsAt: z.string(),
  expiresAt: z.string(),
  note: z.string().nullable(),
});
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

/** `GET /admin/tenants/:id/subscription` — selected current row with its resolved plan. */
export const currentSubscriptionResponseSchema = z.object({
  subscription: subscriptionResponseSchema,
  plan: planResponseSchema.nullable(),
});
export type CurrentSubscriptionResponse = z.infer<typeof currentSubscriptionResponseSchema>;

export const domainResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  hostname: z.string(),
  isPrimary: z.boolean(),
  verifiedAt: z.string().nullable(),
  /** TXT record the tenant must publish to verify a custom domain. */
  verificationToken: z.string().optional(),
});
export type DomainResponse = z.infer<typeof domainResponseSchema>;

/** One row of a tenant's subscription history, with the plan resolved to its name. */
export const subscriptionHistoryItemSchema = subscriptionResponseSchema.extend({
  planName: z.string(),
});
export type SubscriptionHistoryItem = z.infer<typeof subscriptionHistoryItemSchema>;

/**
 * `GET /admin/tenants/:id` — a tenant plus the joins the admin detail screen needs.
 * Deliberately NOT the list shape: `counts` and `subscription` are aggregates, and
 * folding them into {@link tenantResponseSchema} would make `GET /admin/tenants`
 * run a handful of extra queries per row.
 */
export const tenantDetailResponseSchema = tenantResponseSchema.extend({
  /** The current subscription (latest by `startsAt`); null when never subscribed. */
  subscription: z
    .object({
      planName: z.string(),
      status: subscriptionStatusSchema,
      expiresAt: z.string(),
    })
    .nullable(),
  /** The tenant's primary hostname; null if it somehow has none. */
  primaryDomain: domainResponseSchema.nullable(),
  counts: z.object({
    partners: z.number().int().nonnegative(),
    listings: z.number().int().nonnegative(),
    /** Bookings created in the trailing 30 days. */
    bookings30d: z.number().int().nonnegative(),
  }),
});
export type TenantDetailResponse = z.infer<typeof tenantDetailResponseSchema>;

/** Platform-level tenancy config the admin UI needs to render subdomain previews. */
export const tenancyConfigResponseSchema = z.object({
  /** Base domain every tenant's default `<slug>.<baseDomain>` subdomain hangs off. */
  baseDomain: z.string(),
});
export type TenancyConfigResponse = z.infer<typeof tenancyConfigResponseSchema>;

/**
 * Pre-flight for the create-tenant form. Mirrors exactly the two conflicts
 * `POST /admin/tenants` enforces (`TENANT_SLUG_TAKEN`, `DOMAIN_TAKEN`), so a green
 * check here means create will not 409 on the slug.
 */
export const slugAvailabilityResponseSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  /** The subdomain that would be provisioned: `<slug>.<baseDomain>`. */
  subdomain: z.string(),
  baseDomain: z.string(),
  /** Why it is unavailable; null when it is available. */
  reason: z.enum(['slug_taken', 'domain_taken']).nullable(),
});
export type SlugAvailabilityResponse = z.infer<typeof slugAvailabilityResponseSchema>;

/**
 * Result of triggering a custom-domain verification (§6.1). The DNS TXT lookup
 * runs in a background job, so a not-yet-verified domain returns `checking`
 * (the worker flips `verifiedAt` once the record propagates); an
 * already-verified domain returns `verified` immediately.
 */
export const domainVerificationResultSchema = z.object({
  status: z.enum(['verified', 'checking']),
  domain: domainResponseSchema,
});
export type DomainVerificationResult = z.infer<typeof domainVerificationResultSchema>;

/**
 * Soft monthly-bookings quota (§6.5). Never blocks checkout — the dashboard uses
 * `overLimit` to nudge an upgrade. `null` on the status response when the tenant
 * has no active plan.
 */
export const bookingQuotaStatusSchema = z.object({
  used: z.number(),
  limit: z.number(),
  overLimit: z.boolean(),
});
export type BookingQuotaStatus = z.infer<typeof bookingQuotaStatusSchema>;

/**
 * Tenant-facing subscription snapshot the dashboard reads to render a read-only
 * banner (§6.5). `dashboardReadOnly` is true once the subscription has expired or
 * is cancelled; `bookingQuota` surfaces the soft monthly-bookings warning.
 */
export const subscriptionStatusResponseSchema = z.object({
  /** null when the tenant has never been subscribed. */
  status: subscriptionStatusSchema.nullable(),
  phase: z.enum(['active', 'grace', 'expired']),
  storefrontLive: z.boolean(),
  dashboardReadOnly: z.boolean(),
  newBookingsAllowed: z.boolean(),
  daysUntilExpiry: z.number(),
  expiresAt: z.string().nullable(),
  bookingQuota: bookingQuotaStatusSchema.nullable(),
});
export type SubscriptionStatusResponse = z.infer<typeof subscriptionStatusResponseSchema>;

/**
 * What the storefront BFF gets when resolving a Host header (§6.1). `live`
 * false → render the suspended page instead of the storefront.
 */
export const publicTenantResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  vertical: verticalSchema,
  defaultLocale: localeSchema,
  themeConfig: themeConfigSchema,
  live: z.boolean(),
});
export type PublicTenantResponse = z.infer<typeof publicTenantResponseSchema>;
