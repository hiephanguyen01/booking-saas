import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  GmvTrendRow,
  IPlatformHealthReader,
  PlatformHealthFacts,
  TenantCountRow,
  TenantHealthFactsRow,
} from '../../domain/ports/platform-health-reader.port';

const GMV_STATUSES = Prisma.sql`('confirmed','completed','no_show')`;

interface RawTenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  vertical: string;
  created_at: Date;
  gmv: bigint;
  gmv_30d: bigint;
  bookings_30d: number;
  first_booking_at: Date | null;
  published_listings: number;
  manual_refund_open: number;
  manual_refund_overdue: number;
  manual_refund_oldest_minutes: number;
}

interface RawCountRow {
  tenant_id: string;
  count: number;
}

interface RawManualRefundPlatformRow {
  open_operations: number;
  overdue_operations: number;
  awaiting_approval: number;
  oldest_open_minutes: number;
  customer_not_received: number;
}

interface RawTenantWorkflowRow {
  enabled_tenants: number;
  paused_tenants: number;
}

interface RawAuditLogRow {
  reveals_24h: number;
  break_glass_30d: number;
}

@Injectable()
export class PrismaPlatformHealthReader implements IPlatformHealthReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<PlatformHealthFacts> {
    const db = this.prisma.admin;
    const [
      tenantRows,
      webhookRows,
      payoutRows,
      trendRows,
      webhookTotalRows,
      manualRefundPlatformRows,
      tenantWorkflowRows,
      auditLogRows,
    ] = await Promise.all([
      db.$queryRaw<RawTenantRow[]>(Prisma.sql`
        SELECT
          t.id, t.name, t.slug, t.status::text AS status, t.vertical, t.created_at,
          COALESCE(b.gmv, 0)::bigint       AS gmv,
          COALESCE(b.gmv_30d, 0)::bigint   AS gmv_30d,
          COALESCE(b.bookings_30d, 0)::int AS bookings_30d,
          b.first_booking_at,
          COALESCE(l.published, 0)::int    AS published_listings,
          COALESCE(mr.open_count, 0)::int  AS manual_refund_open,
          COALESCE(mr.overdue_count, 0)::int AS manual_refund_overdue,
          COALESCE(mr.oldest_minutes, 0)::int AS manual_refund_oldest_minutes
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
        LEFT JOIN (
          SELECT tenant_id,
            COUNT(*) FILTER (WHERE status <> 'completed')::int AS open_count,
            COUNT(*) FILTER (WHERE status <> 'completed' AND transfer_due_at IS NOT NULL AND transfer_due_at < now())::int AS overdue_count,
            COALESCE(MAX(ROUND(EXTRACT(EPOCH FROM (now() - created_at)) / 60)) FILTER (WHERE status <> 'completed'), 0)::int AS oldest_minutes
          FROM manual_refund_operations
          GROUP BY tenant_id
        ) mr ON mr.tenant_id = t.id
        ORDER BY t.created_at ASC`),
      db.$queryRaw<RawCountRow[]>(Prisma.sql`
        SELECT tenant_id, COUNT(*)::int AS count
        FROM outbox_events
        WHERE processed_at IS NULL
          AND (attempts > 0 OR last_error IS NOT NULL)
          AND tenant_id IS NOT NULL
        GROUP BY tenant_id`),
      db.$queryRaw<RawCountRow[]>(Prisma.sql`
        SELECT tenant_id, COUNT(*)::int AS count
        FROM payouts
        WHERE status IN ('pending','processing')
          AND (
            (period_to IS NOT NULL AND period_to < now())
            OR (period_to IS NULL AND created_at < now() - interval '7 days')
          )
        GROUP BY tenant_id`),
      db.$queryRaw<GmvTrendRow[]>(Prisma.sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(SUM(b.final_amount), 0)::bigint AS gmv
        FROM generate_series(now()::date - interval '13 days', now()::date, interval '1 day') d(day)
        LEFT JOIN bookings b
          ON b.created_at >= d.day AND b.created_at < d.day + interval '1 day'
          AND b.status IN ${GMV_STATUSES}
        GROUP BY d.day ORDER BY d.day`),
      db.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM outbox_events
        WHERE processed_at IS NULL AND (attempts > 0 OR last_error IS NOT NULL)`),
      db.$queryRaw<RawManualRefundPlatformRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE status <> 'completed')::int AS open_operations,
          COUNT(*) FILTER (WHERE status <> 'completed' AND transfer_due_at IS NOT NULL AND transfer_due_at < now())::int AS overdue_operations,
          COUNT(*) FILTER (WHERE status = 'transfer_submitted')::int AS awaiting_approval,
          COALESCE(MAX(ROUND(EXTRACT(EPOCH FROM (now() - created_at)) / 60)) FILTER (WHERE status <> 'completed'), 0)::int AS oldest_open_minutes,
          COUNT(*) FILTER (WHERE customer_acknowledgement = 'not_received')::int AS customer_not_received
        FROM manual_refund_operations`),
      db.$queryRaw<RawTenantWorkflowRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE (settings->>'manual_refund_v2') = 'true')::int AS enabled_tenants,
          COUNT(*) FILTER (WHERE (settings->>'manual_refund_v2') = 'true' AND (settings->>'manual_refund_paused') = 'true')::int AS paused_tenants
        FROM tenants`),
      db.$queryRaw<RawAuditLogRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE action = 'manual_refund.private_details_revealed' AND created_at >= now() - interval '24 hours')::int AS reveals_24h,
          COUNT(*) FILTER (WHERE action = 'manual_refund.break_glass_completed' AND created_at >= now() - interval '30 days')::int AS break_glass_30d
        FROM audit_logs`),
    ]);

    const tenants: TenantHealthFactsRow[] = tenantRows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      vertical: row.vertical,
      createdAt: row.created_at,
      gmv: row.gmv,
      gmv30d: row.gmv_30d,
      bookings30d: row.bookings_30d,
      firstBookingAt: row.first_booking_at,
      publishedListings: row.published_listings,
      manualRefundOpen: row.manual_refund_open,
      manualRefundOverdue: row.manual_refund_overdue,
      manualRefundOldestMinutes: row.manual_refund_oldest_minutes,
    }));
    const toCount = (row: RawCountRow): TenantCountRow => ({
      tenantId: row.tenant_id,
      count: row.count,
    });
    return {
      tenants,
      webhookFailures: webhookRows.map(toCount),
      overduePayouts: payoutRows.map(toCount),
      gmvTrend: trendRows,
      webhookFailureTotal: webhookTotalRows[0]?.total ?? 0,
      manualRefunds: {
        enabledTenants: tenantWorkflowRows[0]?.enabled_tenants ?? 0,
        pausedTenants: tenantWorkflowRows[0]?.paused_tenants ?? 0,
        openOperations: manualRefundPlatformRows[0]?.open_operations ?? 0,
        overdueOperations: manualRefundPlatformRows[0]?.overdue_operations ?? 0,
        awaitingApproval: manualRefundPlatformRows[0]?.awaiting_approval ?? 0,
        oldestOpenMinutes: manualRefundPlatformRows[0]?.oldest_open_minutes ?? 0,
        customerNotReceived: manualRefundPlatformRows[0]?.customer_not_received ?? 0,
        reveals24h: auditLogRows[0]?.reveals_24h ?? 0,
        breakGlass30d: auditLogRows[0]?.break_glass_30d ?? 0,
      },
    };
  }
}
