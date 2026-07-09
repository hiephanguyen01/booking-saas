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
 * Reads busy ranges from the tstzrange columns Prisma can't model. Runs inside
 * the tenant tx, so RLS scopes rows to the tenant automatically. Bookings/holds
 * are empty until Task 1.7, but the queries are already correct.
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

  async activeHolds(
    tx: PrismaTx,
    resourceId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<Interval[]> {
    const rows = await tx.$queryRaw<RangeRow[]>(Prisma.sql`
      SELECT lower(timeslot) AS "start", upper(timeslot) AS "end"
      FROM booking_holds
      WHERE resource_id = ${resourceId}::uuid
        AND expires_at > now()
        AND timeslot && tstzrange(${fromUtc}, ${toUtc}, '[)')`);
    return rows.map((r) => ({ start: r.start, end: r.end }));
  }
}
