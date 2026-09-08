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
  manualRefundOpen: number;
  manualRefundOverdue: number;
  manualRefundOldestMinutes: number;
}

export interface TenantCountRow {
  tenantId: string;
  count: number;
}

export interface GmvTrendRow {
  date: string;
  gmv: bigint;
}

export interface ManualRefundPlatformAggregate {
  enabledTenants: number;
  pausedTenants: number;
  openOperations: number;
  overdueOperations: number;
  awaitingApproval: number;
  oldestOpenMinutes: number;
  customerNotReceived: number;
  reveals24h: number;
  breakGlass30d: number;
}

export interface PlatformHealthFacts {
  tenants: TenantHealthFactsRow[];
  webhookFailures: TenantCountRow[];
  overduePayouts: TenantCountRow[];
  gmvTrend: GmvTrendRow[];
  webhookFailureTotal: number;
  manualRefunds: ManualRefundPlatformAggregate;
}

export interface IPlatformHealthReader {
  read(): Promise<PlatformHealthFacts>;
}

