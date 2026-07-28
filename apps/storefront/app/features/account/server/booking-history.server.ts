import { bookingResponseSchema, type BookingResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { z } from 'zod';
import { apiGet } from '~/lib/api.server';
import { fetchBookingByCode } from '~/features/booking/server/booking.server';
import {
  bookingMatchesFilter,
  type AccountBookingViewModel,
  type BookingHistoryFilter,
  toAccountBookingViewModel,
} from '~/features/account/lib/booking-history';
import { loadCustomerReviewsByBooking } from './customer-reviews.server';

export async function loadAccountBookings(
  request: Request,
  accessToken: string,
  locale: Locale,
  filter: BookingHistoryFilter,
): Promise<{ bookings: AccountBookingViewModel[]; error: string | null }> {
  const [result, reviews] = await Promise.all([
    apiGet<BookingResponse[]>(request, '/public/my-bookings', accessToken, {
      schema: z.array(bookingResponseSchema),
    }),
    loadCustomerReviewsByBooking(request, accessToken),
  ]);

  if (result.ok) {
    const bookings = (result.data ?? []).map((item) =>
      toAccountBookingViewModel(item, locale, reviews.get(item.id) ?? null),
    );
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
  accessToken: string,
): Promise<AccountBookingViewModel | null> {
  const normalizedCode = code.trim().toUpperCase();
  const [booking, reviews] = await Promise.all([
    fetchBookingByCode(request, normalizedCode),
    loadCustomerReviewsByBooking(request, accessToken),
  ]);
  return booking
    ? toAccountBookingViewModel(booking, locale, reviews.get(booking.id) ?? null)
    : null;
}
