import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AvailabilityExceptionType } from '@booking/contracts';
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

function toRecord(e: Row): AvailabilityExceptionRecord {
  return {
    id: e.id,
    resourceId: e.resourceId,
    date: toDateString(e.date),
    type: e.type as AvailabilityExceptionType,
    openTime: e.openTime,
    closeTime: e.closeTime,
    reason: e.reason,
  };
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
    return toRecord(
      await tx.availabilityException.create({
        data: {
          tenantId,
          resourceId,
          date: new Date(`${data.date}T00:00:00Z`),
          type: data.type,
          openTime: data.openTime ?? null,
          closeTime: data.closeTime ?? null,
          reason: data.reason ?? null,
        },
      }),
    );
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.availabilityException.delete({ where: { id } });
  }

  async findById(tx: PrismaTx, id: string): Promise<AvailabilityExceptionRecord | null> {
    const e = await tx.availabilityException.findUnique({ where: { id } });
    return e ? toRecord(e) : null;
  }
}
