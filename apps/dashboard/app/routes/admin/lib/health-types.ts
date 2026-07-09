/**
 * Local mirror of the backend `GET /platform/health` response
 * (apps/api/.../platform-health.controller.ts). This shape is intentionally NOT
 * in @booking/shared — the health board is admin-only, so the contract lives
 * beside its single consumer. Keep the two in sync when either changes.
 */
export interface PlatformHealthTenant {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  /** VND đồng digit strings. */
  gmv: string;
  gmv30d: string;
  bookings30d: number;
  /** Hours from tenant creation to first realized booking; null = none yet. */
  firstBookingHours: number | null;
  publishedListings: number;
  webhookFailures: number;
  overduePayouts: number;
  subscription: { status: string; expiresAt: string; planName: string } | null;
}

export interface PlatformHealthResponse {
  kpis: {
    tenantCount: number;
    activeTenantCount: number;
    gmvAllTime: string;
    gmv30d: string;
    publishedListings: number;
    bookings30d: number;
    webhookFailures: number;
    overduePayouts: number;
  };
  gmvTrend: Array<{ date: string; gmv: string }>;
  tenants: PlatformHealthTenant[];
  expiring: Array<{
    tenantId: string;
    tenantName: string;
    planName: string;
    status: string;
    expiresAt: string;
    daysLeft: number;
  }>;
}
