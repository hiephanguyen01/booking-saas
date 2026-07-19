import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import type { PartnerCalendarBooking } from '../domain/ports/booking-repository.port';
import { toAdditionalCharges, toPartnerCustomer } from './booking.mapper';

export type { PartnerCalendarBookingResponse };

/**
 * Partner master-calendar feed → wire. PARTNER audience: the customer goes
 * through {@link toPartnerCustomer}, so the same §7.3 policy as
 * `toPartnerBookingResponse` applies here — no email ever, phone masked until
 * the booking is `confirmed`.
 */
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
    customer: toPartnerCustomer(b.customer, b.status),
    finalAmount: b.finalAmount.toString(),
    discountAmount: b.discountAmount.toString(),
    depositAmount: b.depositAmount.toString(),
    paidAmount: b.paidAmount.toString(),
    additionalCharges: toAdditionalCharges(b.additionalCharges),
    securityDeposit: b.securityDeposit.toString(),
    pickedUpAt: b.pickedUpAt ? b.pickedUpAt.toISOString() : null,
    returnedAt: b.returnedAt ? b.returnedAt.toISOString() : null,
    customerNote: b.customerNote,
    expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  };
}
