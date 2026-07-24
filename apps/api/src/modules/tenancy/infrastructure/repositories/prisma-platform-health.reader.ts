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
}

interface RawCountRow {
  tenant_id: string;
  count: number;
}

@Injectable()
export class PrismaPlatformHealthReader implements IPlatformHealthReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<PlatformHealthFacts> {
    const db = this.prisma.admin;
    const [tenantRows, webhookRows, payoutRows, trendRows, webhookTotalRows] = await Promise.all([
      db.$queryRaw<RawTenantRow[]>(Prisma.sql`
        SELECT
          t.id, t.name, t.slug, t.status::text AS status, t.vertical, t.created_at,
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
    };
  }
}
