import { bookingListingSnapshotSchema, type BookingListingSnapshot } from '@booking/contracts';

export function buildBookingListingSnapshot(
  listing: BookingListingSnapshot,
): BookingListingSnapshot {
  return bookingListingSnapshotSchema.parse(listing);
}

export function parseBookingListingSnapshot(raw: unknown): BookingListingSnapshot | null {
  const parsed = bookingListingSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
