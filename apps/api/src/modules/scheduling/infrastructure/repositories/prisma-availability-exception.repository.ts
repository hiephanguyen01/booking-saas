import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AvailabilityExceptionType, AvailabilityWindow } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AvailabilityExceptionInputData,
  AvailabilityExceptionRecord,
  IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';

type Row = Prisma.AvailabilityExceptionGetPayload<Record<string, never>>;

/** `@db.Date` comes back as a UTC-midnight Date; render the calendar date only. */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The day's windows. `windows` is authoritative; the legacy pair is only read
 * for rows written before that column existed, and a `closed` day has none.
 */
function toWindows(e: Row): AvailabilityWindow[] {
  if (Array.isArray(e.windows)) {
    return (e.windows as unknown[]).flatMap((value) => {
      const window = value as { openTime?: unknown; closeTime?: unknown };
      return typeof window.openTime === 'string' && typeof window.closeTime === 'string'
        ? [{ openTime: window.openTime, closeTime: window.closeTime }]
        : [];
    });
  }
  if (e.type === 'custom_hours' && e.openTime && e.closeTime) {
    return [{ openTime: e.openTime, closeTime: e.closeTime }];
  }
  return [];
}

function toRecord(e: Row): AvailabilityExceptionRecord {
  return {
    id: e.id,
    resourceId: e.resourceId,
    date: toDateString(e.date),
    type: e.type as AvailabilityExceptionType,
    windows: toWindows(e),
    openTime: e.openTime,
    closeTime: e.closeTime,
    reason: e.reason,
  };
}

/** `windows` to persist, plus the `windows[0]` mirror kept for legacy readers. */
function toWindowColumns(data: AvailabilityExceptionInputData): {
  windows: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  openTime: string | null;
  closeTime: string | null;
} {
  const windows =
    data.windows && data.windows.length > 0
      ? [...data.windows].sort((a, b) => a.openTime.localeCompare(b.openTime))
      : data.openTime && data.closeTime
        ? [{ openTime: data.openTime, closeTime: data.closeTime }]
        : [];
  if (data.type === 'closed' || windows.length === 0) {
    return { windows: Prisma.JsonNull, openTime: null, closeTime: null };
  }
  const first = windows[0]!;
  return { windows, openTime: first.openTime, closeTime: first.closeTime };
}

@Injectable()
export class PrismaAvailabilityExceptionRepository implements IAvailabilityExceptionRepository {
  async listByResource(
    tx: PrismaTx,
    resourceId: string,
    fromDate: string,
    toDate: string,
  ): Promise<AvailabilityExceptionRecord[]> {
    const rows = await tx.availabilityException.findMany({
      where: {
        resourceId,
        date: { gte: new Date(`${fromDate}T00:00:00Z`), lte: new Date(`${toDate}T00:00:00Z`) },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map(toRecord);
  }

  async create(
    tx: PrismaTx,
    tenantId: string,
    resourceId: string,
    data: AvailabilityExceptionInputData,
  ): Promise<AvailabilityExceptionRecord> {
    const columns = toWindowColumns(data);
    return toRecord(
      await tx.availabilityException.upsert({
        where: {
          resourceId_date: {
            resourceId,
            date: new Date(`${data.date}T00:00:00Z`),
          },
        },
        update: {
          type: data.type,
          ...columns,
          reason: data.reason ?? null,
        },
        create: {
          tenantId,
          resourceId,
          date: new Date(`${data.date}T00:00:00Z`),
          type: data.type,
          ...columns,
          reason: data.reason ?? null,
        },
      }),
    );
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.availabilityException.delete({ where: { id } });
  }

  async deleteInRange(
    tx: PrismaTx,
    resourceId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const { count } = await tx.availabilityException.deleteMany({
      where: {
        resourceId,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
    });
    return count;
  }

  async findById(tx: PrismaTx, id: string): Promise<AvailabilityExceptionRecord | null> {
    const e = await tx.availabilityException.findUnique({ where: { id } });
    return e ? toRecord(e) : null;
  }
}
