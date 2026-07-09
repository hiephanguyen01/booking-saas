import type { BookingStatus } from '@booking/shared';

/**
 * Wire shape of the partner master-calendar feed (`GET /partner/bookings`). Not a
 * `@booking/shared` contract - mirrored here so the dashboard types the loader
 * response. Amounts are VND đồng digit strings; instants are UTC ISO strings.
 */
export interface PartnerCalendarBooking {
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
