import type { BookingStatus } from '@booking/shared';
import type { PartnerCalendarBooking } from '../domain/ports/booking-repository.port';

/**
 * Wire shape for the partner master-calendar feed (Task 1.14). Kept local to the
 * booking module (not in `@booking/shared`): amounts cross as VND đồng digit
 * strings, instants as UTC ISO strings.
 */
export interface PartnerCalendarBookingResponse {
  id: string;
  code: string;
  status: BookingStatus;
  listingId: string;
  listingTitle: string;
  listingTypeId: string;
  listingTypeName: string;
  resourceId: string;
  bookingMode: string;
  startUtc: string;
  endUtc: string;
  guestCount: number;
  quantity: number;
  finalAmount: string;
}

export function toPartnerCalendarResponse(
  b: PartnerCalendarBooking,
): PartnerCalendarBookingResponse {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    listingId: b.listingId,
    listingTitle: b.listingTitle,
    listingTypeId: b.listingTypeId,
    listingTypeName: b.listingTypeName,
    resourceId: b.resourceId,
    bookingMode: b.bookingMode,
    startUtc: b.startUtc.toISOString(),
    endUtc: b.endUtc.toISOString(),
    guestCount: b.guestCount,
    quantity: b.quantity,
    finalAmount: b.finalAmount.toString(),
  };
}
