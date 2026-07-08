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

// ── Responses ────────────────────────────────────────────────────────────────

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  vertical: Vertical;
  defaultTimezone: string;
  defaultLocale: 'vi' | 'en';
  createdAt: string;
}

export interface PlanResponse {
  id: string;
  name: string;
  /** VND đồng as a digit string. */
  priceMonthly: string;
  limits: PlanLimits;
  isActive: boolean;
}

export interface SubscriptionResponse {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  startsAt: string;
  expiresAt: string;
  note: string | null;
}

export interface DomainResponse {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  /** TXT record the tenant must publish to verify a custom domain. */
  verificationToken?: string;
}

/**
 * What the storefront BFF gets when resolving a Host header (§6.1). `live`
 * false → render the suspended page instead of the storefront.
 */
export interface PublicTenantResponse {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  defaultLocale: 'vi' | 'en';
  themeConfig: Record<string, unknown>;
  live: boolean;
}
