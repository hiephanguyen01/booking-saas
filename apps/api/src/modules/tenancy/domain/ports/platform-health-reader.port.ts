export const PLATFORM_HEALTH_READER = Symbol('PLATFORM_HEALTH_READER');

export interface TenantHealthFactsRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  vertical: string;
  createdAt: Date;
  gmv: bigint;
  gmv30d: bigint;
  bookings30d: number;
  firstBookingAt: Date | null;
  publishedListings: number;
}

export interface TenantCountRow {
  tenantId: string;
  count: number;
}

export interface GmvTrendRow {
  date: string;
  gmv: bigint;
}

export interface PlatformHealthFacts {
  tenants: TenantHealthFactsRow[];
  webhookFailures: TenantCountRow[];
  overduePayouts: TenantCountRow[];
  gmvTrend: GmvTrendRow[];
  webhookFailureTotal: number;
}

export interface IPlatformHealthReader {
  read(): Promise<PlatformHealthFacts>;
}
