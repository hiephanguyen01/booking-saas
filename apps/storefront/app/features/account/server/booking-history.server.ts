import { bookingResponseSchema, type BookingResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { z } from 'zod';
import { apiGet } from '../../../lib/api.server';
import { fetchBookingByCode } from '../../../lib/booking.server';
import {
  bookingMatchesFilter,
  type AccountBookingViewModel,
  type BookingHistoryFilter,
  toAccountBookingViewModel,
} from '../lib/booking-history';

export async function loadAccountBookings(
  request: Request,
  accessToken: string,
  locale: Locale,
  filter: BookingHistoryFilter,
): Promise<{ bookings: AccountBookingViewModel[]; error: string | null }> {
  const result = await apiGet<BookingResponse[]>(request, '/public/my-bookings', accessToken, {
    schema: z.array(bookingResponseSchema),
  });

  if (result.ok) {
    const bookings = (result.data ?? []).map((item) => toAccountBookingViewModel(item, locale));
    return {
      bookings: bookings.filter((item) => bookingMatchesFilter(item, filter)),
      error: null,
    };
  }

  return {
    bookings: [],
    error: result.error ?? 'BOOKINGS_UNAVAILABLE',
  };
}

export async function loadAccountBooking(
  request: Request,
  code: string,
  locale: Locale,
): Promise<AccountBookingViewModel | null> {
  const normalizedCode = code.trim().toUpperCase();
  const booking = await fetchBookingByCode(request, normalizedCode);
  return booking ? toAccountBookingViewModel(booking, locale) : null;
}
