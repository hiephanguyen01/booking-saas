import { Inject, Injectable } from '@nestjs/common';
import {
  BILLABLE_SUBSCRIPTION_STATUSES,
  evaluateSubscription,
} from '../../domain/subscription-status';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../domain/ports/current-subscription-reader.port';
import {
  PLATFORM_HEALTH_READER,
  type IPlatformHealthReader,
} from '../../domain/ports/platform-health-reader.port';

/**
 * Platform-admin health board (Task 1.12 / §13.3). A cross-tenant read that
 * aggregates GMV, catalog, activation, webhook and payout health per tenant plus
 * platform KPIs and the queue of subscriptions about to expire. The read adapter
 * owns the BYPASSRLS admin-pool queries because the projection spans every tenant.
 *
 * "GMV" = sum of `final_amount` for bookings that reached at least `confirmed`
 * (`confirmed`, `completed`, `no_show`) — realized gross merchandise value. GMV is
 * the *merchants'* turnover; the platform's own revenue is `kpis.mrr`, summed from
 * the plan each tenant is currently subscribed to. The two are not comparable and
 * must not be added together.
 */

export interface TenantHealthRow {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  vertical: string;
  createdAt: Date;
  gmv: bigint;
  gmv30d: bigint;
  bookings30d: number;
  /** Hours between tenant creation and its first realized booking; null = none yet. */
  firstBookingHours: number | null;
  publishedListings: number;
  webhookFailures: number;
  overduePayouts: number;
  subscription: { status: string; expiresAt: Date; planName: string } | null;
}

export interface ExpiringSubscriptionRow {
  tenantId: string;
  tenantName: string;
  planName: string;
  status: string;
  expiresAt: Date;
  daysLeft: number;
}

export interface PlatformHealth {
  kpis: {
    tenantCount: number;
    activeTenantCount: number;
    /** Merchant turnover, NOT platform income. */
    gmvAllTime: bigint;
    gmv30d: bigint;
    /** The platform's own monthly recurring subscription revenue, in VND đồng. */
    mrr: bigint;
    publishedListings: number;
    bookings30d: number;
    webhookFailures: number;
    overduePayouts: number;
  };
  gmvTrend: Array<{ date: string; gmv: bigint }>;
  tenants: TenantHealthRow[];
  expiring: ExpiringSubscriptionRow[];
}

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

@Injectable()
export class GetPlatformHealthUseCase {
  constructor(
    @Inject(PLATFORM_HEALTH_READER)
    private readonly healthReader: IPlatformHealthReader,
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
  ) {}

  async execute(): Promise<PlatformHealth> {
    const [facts, subscriptionSnapshot] = await Promise.all([
      this.healthReader.read(),
      this.currentSubscriptions.listCurrent(),
    ]);
    const webhookByTenant = new Map(facts.webhookFailures.map((r) => [r.tenantId, r.count]));
    const payoutByTenant = new Map(facts.overduePayouts.map((r) => [r.tenantId, r.count]));
    const subByTenant = new Map(
      subscriptionSnapshot.items.map((item) => [item.subscription.tenantId, item]),
    );

    const tenants: TenantHealthRow[] = facts.tenants.map((t) => {
      const sub = subByTenant.get(t.id);
      const firstBookingHours = t.firstBookingAt
        ? Math.max(0, Math.round((t.firstBookingAt.getTime() - t.createdAt.getTime()) / MS_PER_HOUR))
        : null;
      return {
        tenantId: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        vertical: t.vertical,
        createdAt: t.createdAt,
        gmv: t.gmv,
        gmv30d: t.gmv30d,
        bookings30d: t.bookings30d,
        firstBookingHours,
        publishedListings: t.publishedListings,
        webhookFailures: webhookByTenant.get(t.id) ?? 0,
        overduePayouts: payoutByTenant.get(t.id) ?? 0,
        subscription: sub
          ? {
              status: sub.subscription.status,
              expiresAt: sub.subscription.expiresAt,
              planName: sub.plan.name,
            }
          : null,
      };
    });

    const nowDate = subscriptionSnapshot.evaluatedAt;
    const now = nowDate.getTime();

    /**
     * Platform MRR: the plan price of every tenant whose current subscription is
     * still live. "Live" is decided by the §6.5 domain rule rather than re-derived
     * here, so this KPI cannot drift from the lifecycle the tenant actually
     * experiences. Summed as bigint — VND never goes through a float.
     */
    const mrr = subscriptionSnapshot.items.reduce((acc, item) => {
      const { phase } = evaluateSubscription(item.subscription, nowDate);
      return phase === 'active' ? acc + item.plan.priceMonthly : acc;
    }, 0n);

    const expiring: ExpiringSubscriptionRow[] = tenants
      .filter(
        (t) =>
          t.subscription &&
          (BILLABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(t.subscription.status) &&
          (t.subscription.expiresAt.getTime() - now) / MS_PER_DAY <= 14,
      )
      .map((t) => ({
        tenantId: t.tenantId,
        tenantName: t.name,
        planName: t.subscription!.planName,
        status: t.subscription!.status,
        expiresAt: t.subscription!.expiresAt,
        daysLeft: Math.ceil((t.subscription!.expiresAt.getTime() - now) / MS_PER_DAY),
      }))
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

    return {
      kpis: {
        tenantCount: tenants.length,
        activeTenantCount: tenants.filter((t) => t.status === 'active').length,
        gmvAllTime: tenants.reduce((acc, t) => acc + t.gmv, 0n),
        gmv30d: tenants.reduce((acc, t) => acc + t.gmv30d, 0n),
        mrr,
        publishedListings: tenants.reduce((acc, t) => acc + t.publishedListings, 0),
        bookings30d: tenants.reduce((acc, t) => acc + t.bookings30d, 0),
        webhookFailures: facts.webhookFailureTotal,
        overduePayouts: facts.overduePayouts.reduce((acc, r) => acc + r.count, 0),
      },
      gmvTrend: facts.gmvTrend,
      tenants,
      expiring,
    };
  }
}
