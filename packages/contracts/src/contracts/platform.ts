/**
 * Platform-admin health board (`GET /platform/health`, Task 1.12). Shared so the
 * backend controller and the dashboard type the same contract instead of each
 * hand-mirroring it. Money crosses the wire as VND đồng digit strings; timestamps
 * as UTC ISO strings.
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

export interface PlatformHealthExpiring {
  tenantId: string;
  tenantName: string;
  planName: string;
  status: string;
  expiresAt: string;
  daysLeft: number;
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
  expiring: PlatformHealthExpiring[];
}
