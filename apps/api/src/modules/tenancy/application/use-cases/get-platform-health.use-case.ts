import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

/**
 * Platform-admin health board (Task 1.12 / §13.3). A cross-tenant read that
 * aggregates GMV, catalog, activation, webhook and payout health per tenant plus
 * platform KPIs and the queue of subscriptions about to expire. Uses the
 * BYPASSRLS admin pool explicitly (like GetPlatformFinanceUseCase) since it spans
 * every tenant.
 *
 * "GMV" = sum of `final_amount` for bookings that reached at least `confirmed`
 * (`confirmed`, `completed`, `no_show`) — realized gross merchandise value.
 */

/** Booking statuses that count toward realized GMV. */
const GMV_STATUSES = Prisma.sql`('confirmed','completed','no_show')`;

export interface TenantHealthRow {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
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
    gmvAllTime: bigint;
    gmv30d: bigint;
    publishedListings: number;
    bookings30d: number;
    webhookFailures: number;
    overduePayouts: number;
  };
  gmvTrend: Array<{ date: string; gmv: bigint }>;
  tenants: TenantHealthRow[];
  expiring: ExpiringSubscriptionRow[];
}

interface TenantAggRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: Date;
  gmv: bigint;
  gmv_30d: bigint;
  bookings_30d: number;
  first_booking_at: Date | null;
  published_listings: number;
}
interface CountRow {
  tenant_id: string;
  count: number;
}
interface SubRow {
  tenant_id: string;
  status: string;
  expires_at: Date;
  plan_name: string;
}
interface TrendRow {
  date: string;
  gmv: bigint;
}
interface TotalRow {
  total: number;
}

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

@Injectable()
export class GetPlatformHealthUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<PlatformHealth> {
    const db = this.prisma.admin;

    const [tenantRows, webhookRows, payoutRows, subRows, trendRows, webhookTotalRows] =
      await Promise.all([
        db.$queryRaw<TenantAggRow[]>(Prisma.sql`
          SELECT
            t.id, t.name, t.slug, t.status::text AS status, t.created_at,
            COALESCE(b.gmv, 0)::bigint       AS gmv,
            COALESCE(b.gmv_30d, 0)::bigint   AS gmv_30d,
            COALESCE(b.bookings_30d, 0)::int AS bookings_30d,
            b.first_booking_at,
            COALESCE(l.published, 0)::int    AS published_listings
          FROM tenants t
          LEFT JOIN (
            SELECT tenant_id,
              SUM(final_amount) FILTER (WHERE status IN ${GMV_STATUSES}) AS gmv,
              SUM(final_amount) FILTER (WHERE status IN ${GMV_STATUSES}
                AND created_at >= now() - interval '30 days') AS gmv_30d,
              COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS bookings_30d,
              MIN(created_at) FILTER (WHERE status IN ${GMV_STATUSES}) AS first_booking_at
            FROM bookings GROUP BY tenant_id
          ) b ON b.tenant_id = t.id
          LEFT JOIN (
            SELECT tenant_id, COUNT(*) AS published
            FROM listings WHERE status = 'published' GROUP BY tenant_id
          ) l ON l.tenant_id = t.id
          ORDER BY t.created_at ASC`),

        db.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT tenant_id, COUNT(*)::int AS count
          FROM outbox_events
          WHERE processed_at IS NULL
            AND (attempts > 0 OR last_error IS NOT NULL)
            AND tenant_id IS NOT NULL
          GROUP BY tenant_id`),

        db.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT tenant_id, COUNT(*)::int AS count
          FROM payouts
          WHERE status IN ('pending','processing')
            AND (
              (period_to IS NOT NULL AND period_to < now())
              OR (period_to IS NULL AND created_at < now() - interval '7 days')
            )
          GROUP BY tenant_id`),

        db.$queryRaw<SubRow[]>(Prisma.sql`
          SELECT DISTINCT ON (s.tenant_id)
            s.tenant_id, s.status::text AS status, s.expires_at, p.name AS plan_name
          FROM tenant_subscriptions s
          JOIN subscription_plans p ON p.id = s.plan_id
          ORDER BY s.tenant_id, s.created_at DESC`),

        db.$queryRaw<TrendRow[]>(Prisma.sql`
          SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(SUM(b.final_amount), 0)::bigint AS gmv
          FROM generate_series(now()::date - interval '13 days', now()::date, interval '1 day') d(day)
          LEFT JOIN bookings b
            ON b.created_at >= d.day AND b.created_at < d.day + interval '1 day'
            AND b.status IN ${GMV_STATUSES}
          GROUP BY d.day ORDER BY d.day`),

        db.$queryRaw<TotalRow[]>(Prisma.sql`
          SELECT COUNT(*)::int AS total
          FROM outbox_events
          WHERE processed_at IS NULL AND (attempts > 0 OR last_error IS NOT NULL)`),
      ]);

    const webhookByTenant = new Map(webhookRows.map((r) => [r.tenant_id, r.count]));
    const payoutByTenant = new Map(payoutRows.map((r) => [r.tenant_id, r.count]));
    const subByTenant = new Map(subRows.map((r) => [r.tenant_id, r]));

    const tenants: TenantHealthRow[] = tenantRows.map((t) => {
      const sub = subByTenant.get(t.id);
      const firstBookingHours = t.first_booking_at
        ? Math.max(0, Math.round((t.first_booking_at.getTime() - t.created_at.getTime()) / MS_PER_HOUR))
        : null;
      return {
        tenantId: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        createdAt: t.created_at,
        gmv: t.gmv,
        gmv30d: t.gmv_30d,
        bookings30d: t.bookings_30d,
        firstBookingHours,
        publishedListings: t.published_listings,
        webhookFailures: webhookByTenant.get(t.id) ?? 0,
        overduePayouts: payoutByTenant.get(t.id) ?? 0,
        subscription: sub
          ? { status: sub.status, expiresAt: sub.expires_at, planName: sub.plan_name }
          : null,
      };
    });

    const now = Date.now();
    const expiring: ExpiringSubscriptionRow[] = tenants
      .filter(
        (t) =>
          t.subscription &&
          ['trial', 'active', 'past_due'].includes(t.subscription.status) &&
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
        publishedListings: tenants.reduce((acc, t) => acc + t.publishedListings, 0),
        bookings30d: tenants.reduce((acc, t) => acc + t.bookings30d, 0),
        webhookFailures: webhookTotalRows[0]?.total ?? 0,
        overduePayouts: payoutRows.reduce((acc, r) => acc + r.count, 0),
      },
      gmvTrend: trendRows.map((r) => ({ date: r.date, gmv: r.gmv })),
      tenants,
      expiring,
    };
  }
}
