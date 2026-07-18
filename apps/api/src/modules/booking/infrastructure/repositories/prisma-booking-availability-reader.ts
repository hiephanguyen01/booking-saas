import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  BookingSchedule,
  IBookingAvailabilityReader,
} from '../../domain/ports/booking-availability-reader.port';

@Injectable()
export class PrismaBookingAvailabilityReader implements IBookingAvailabilityReader {
  async read(tx: PrismaTx, listingId: string, resourceId: string): Promise<BookingSchedule> {
    const [weekly, exceptions] = await Promise.all([
      tx.availabilityRule.findMany({
        where: { listingId },
        select: { dayOfWeek: true, openTime: true, closeTime: true },
      }),
      tx.availabilityException.findMany({
        where: { resourceId },
        select: { date: true, type: true, openTime: true, closeTime: true },
      }),
    ]);
    return {
      weekly,
      exceptions: exceptions.map((item) => ({
        date: item.date.toISOString().slice(0, 10),
        type: item.type,
        openTime: item.openTime,
        closeTime: item.closeTime,
      })),
    };
  }
}
