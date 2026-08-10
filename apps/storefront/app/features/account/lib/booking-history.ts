import {
  BOOKING_DETAIL_VARIANTS,
  type BookingDetailViewModel,
} from '~/features/booking/lib/booking-detail-model';

/**
 * Filtering one's own past bookings is an account concept, so it stays here —
 * unlike the booking detail itself, which `features/booking` owns because the
 * guest lookup renders the same thing.
 *
 * The filters are the detail variants plus "all", derived rather than restated,
 * so a new variant cannot silently go missing from the tab strip.
 */
export const BOOKING_HISTORY_FILTERS = ['all', ...BOOKING_DETAIL_VARIANTS] as const;

export type BookingHistoryFilter = (typeof BOOKING_HISTORY_FILTERS)[number];
export type BookingHistoryCounts = Record<BookingHistoryFilter, number>;

export function bookingHistoryCounts(
  bookings: Pick<BookingDetailViewModel, 'variant'>[],
): BookingHistoryCounts {
  return BOOKING_HISTORY_FILTERS.reduce<BookingHistoryCounts>(
    (counts, filter) => {
      counts[filter] = bookings.filter((booking) => bookingMatchesFilter(booking, filter)).length;
      return counts;
    },
    { all: 0, payment: 0, upcoming: 0, completed: 0, cancelled: 0, 'no-show': 0 },
  );
}

export function bookingMatchesSearch(
  booking: Pick<BookingDetailViewModel, 'code' | 'listingTitle' | 'partnerName'>,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [booking.code, booking.listingTitle, booking.partnerName].some((value) =>
    value.toLocaleLowerCase().includes(normalized),
  );
}

export function parseBookingHistoryFilter(value: string | null): BookingHistoryFilter {
  return BOOKING_HISTORY_FILTERS.includes(value as BookingHistoryFilter)
    ? (value as BookingHistoryFilter)
    : 'all';
}

export function bookingMatchesFilter(
  booking: Pick<BookingDetailViewModel, 'variant'>,
  filter: BookingHistoryFilter,
): boolean {
  return filter === 'all' || booking.variant === filter;
}
