import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const BOOKING_AVAILABILITY_READER = Symbol('BOOKING_AVAILABILITY_READER');

export interface BookingSchedule {
  weekly: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
  exceptions: Array<{
    date: string;
    type: 'closed' | 'custom_hours';
    openTime: string | null;
    closeTime: string | null;
  }>;
}

export interface IBookingAvailabilityReader {
  read(tx: PrismaTx, listingId: string, resourceId: string): Promise<BookingSchedule>;
}
