import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IOpenHoursReader,
  OpenHoursForDate,
} from '../../domain/ports/open-hours-reader.port';

/** Narrow the stored jsonb into the kernel's window shape; junk entries are dropped. */
function toWindows(value: unknown): { openTime: string; closeTime: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) => {
    const window = entry as { openTime?: unknown; closeTime?: unknown };
    return typeof window.openTime === 'string' && typeof window.closeTime === 'string'
      ? [{ openTime: window.openTime, closeTime: window.closeTime }]
      : [];
  });
}

@Injectable()
export class PrismaOpenHoursReader implements IOpenHoursReader {
  async forDate(
    tx: PrismaTx,
    listingId: string,
    resourceId: string,
    date: string,
  ): Promise<OpenHoursForDate> {
    const [rules, exception] = await Promise.all([
      tx.availabilityRule.findMany({
        where: { listingId },
        select: { dayOfWeek: true, openTime: true, closeTime: true },
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
      }),
      tx.availabilityException.findUnique({
        where: { resourceId_date: { resourceId, date: new Date(`${date}T00:00:00Z`) } },
        select: { type: true, windows: true, openTime: true, closeTime: true },
      }),
    ]);
    return {
      rules,
      exception: exception
        ? {
            type: exception.type as 'closed' | 'custom_hours',
            windows: toWindows(exception.windows),
            openTime: exception.openTime,
            closeTime: exception.closeTime,
          }
        : null,
    };
  }
}
