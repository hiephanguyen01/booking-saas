import { z } from 'zod';

/**
 * Platform-admin health board (`GET /platform/health`, Task 1.12). Shared so the
 * backend controller and the dashboard type the same contract instead of each
 * hand-mirroring it. Money crosses the wire as VND đồng digit strings; timestamps
 * as UTC ISO strings.
 */
export const platformHealthTenantSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  /** Storefront base template (§16.1) — `studio` | `rental` | `classes`. */
  vertical: z.string(),
  createdAt: z.string(),
  /** VND đồng digit strings. */
  gmv: z.string(),
  gmv30d: z.string(),
  bookings30d: z.number(),
  /** Hours from tenant creation to first realized booking; null = none yet. */
  firstBookingHours: z.number().nullable(),
  publishedListings: z.number(),
  webhookFailures: z.number(),
  overduePayouts: z.number(),
  subscription: z
    .object({ status: z.string(), expiresAt: z.string(), planName: z.string() })
    .nullable(),
});
export type PlatformHealthTenant = z.infer<typeof platformHealthTenantSchema>;

export const platformHealthExpiringSchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  planName: z.string(),
  status: z.string(),
  expiresAt: z.string(),
  daysLeft: z.number(),
});
export type PlatformHealthExpiring = z.infer<typeof platformHealthExpiringSchema>;

export const platformHealthResponseSchema = z.object({
  kpis: z.object({
    tenantCount: z.number(),
    activeTenantCount: z.number(),
    /**
     * GMV is *merchant* turnover, not platform income. The platform's own revenue
     * is {@link mrr} — keep the two apart when reading this board.
     */
    gmvAllTime: z.string(),
    gmv30d: z.string(),
    /**
     * The platform's own monthly recurring subscription revenue (VND đồng digit
     * string): the summed `price_monthly` of every tenant's current subscription
     * that is still within its paid-through date (§6.5).
     */
    mrr: z.string(),
    publishedListings: z.number(),
    bookings30d: z.number(),
    webhookFailures: z.number(),
    overduePayouts: z.number(),
  }),
  gmvTrend: z.array(z.object({ date: z.string(), gmv: z.string() })),
  tenants: z.array(platformHealthTenantSchema),
  expiring: z.array(platformHealthExpiringSchema),
});
export type PlatformHealthResponse = z.infer<typeof platformHealthResponseSchema>;
