import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { Interval } from '../../domain/availability/interval';
import type { IBusyReader } from '../../domain/ports/busy-reader.port';

interface RangeRow {
  start: Date;
  end: Date;
}

/**
 * Reads the booking-derived busy set from the tstzrange columns Prisma can't
 * model. Runs inside the tenant tx, so RLS scopes rows to the tenant
 * automatically. Holds are read from Redis (see RedisHoldReader), not here.
 */
@Injectable()
export class PrismaBusyReader implements IBusyReader {
  async busyBookings(
    tx: PrismaTx,
    resourceId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<Interval[]> {
    const rows = await tx.$queryRaw<RangeRow[]>(Prisma.sql`
      SELECT lower(blocked_period) AS "start", upper(blocked_period) AS "end"
      FROM bookings
      WHERE resource_id = ${resourceId}::uuid
        AND status IN ('pending_payment', 'pending_approval', 'confirmed')
        AND booking_mode NOT IN ('inventory', 'class')
        AND blocked_period && tstzrange(${fromUtc}, ${toUtc}, '[)')`);
    return rows.map((r) => ({ start: r.start, end: r.end }));
  }

  async inventoryUsage(tx: PrismaTx, listingId: string, fromUtc: Date, toUtc: Date): Promise<number> {
    const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(quantity), 0)::int AS "used"
      FROM bookings
      WHERE listing_id = ${listingId}::uuid
        AND booking_mode = 'inventory'
        AND status IN ('pending_payment', 'pending_approval', 'confirmed')
        AND returned_at IS NULL
        AND (blocked_period && tstzrange(${fromUtc}, ${toUtc}, '[)') OR upper(blocked_period) <= now())`);
    return rows[0]?.used ?? 0;
  }
}
