import { z } from 'zod';
import { localeSchema, uuidSchema } from './common';

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

export const createPlanInputSchema = z.object({
  name: z.string().min(1).max(120),
  /** VND đồng as a digit string (money never travels as a JS number). */
  priceMonthly: z.string().regex(/^\d+$/, 'Must be an integer amount in VND đồng'),
  limits: planLimitsSchema,
  isActive: z.boolean().default(true),
});
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;

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

// ── Responses ────────────────────────────────────────────────────────────────

export const tenantResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: tenantStatusSchema,
  vertical: verticalSchema,
  defaultTimezone: z.string(),
  defaultLocale: localeSchema,
  createdAt: z.string(),
});
export type TenantResponse = z.infer<typeof tenantResponseSchema>;

export const planResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** VND đồng as a digit string. */
  priceMonthly: z.string(),
  limits: planLimitsSchema,
  isActive: z.boolean(),
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
  themeConfig: z.record(z.unknown()),
  live: z.boolean(),
});
export type PublicTenantResponse = z.infer<typeof publicTenantResponseSchema>;
