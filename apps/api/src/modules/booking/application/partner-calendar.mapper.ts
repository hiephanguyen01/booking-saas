import type { PartnerCalendarBookingResponse } from '@booking/shared';
import type { PartnerCalendarBooking } from '../domain/ports/booking-repository.port';

export type { PartnerCalendarBookingResponse };

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
    securityDeposit: b.securityDeposit.toString(),
    pickedUpAt: b.pickedUpAt ? b.pickedUpAt.toISOString() : null,
    returnedAt: b.returnedAt ? b.returnedAt.toISOString() : null,
  };
}
