import { bookingResponseSchema, type BookingResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { z } from 'zod';
import { apiGet } from '../../../lib/api.server';
import { fetchBookingByCode } from '../../../lib/booking.server';
import { storefrontEnv } from '../../../lib/env.server';
import {
  bookingMatchesFilter,
  type AccountBookingViewModel,
  type BookingHistoryFilter,
  toAccountBookingViewModel,
} from '../lib/booking-history';
import {
  ACCOUNT_BOOKING_FIXTURES,
  ACCOUNT_BOOKING_LIST_FIXTURES,
} from './booking-history-fixtures.server';

export async function loadAccountBookings(
  request: Request,
  accessToken: string,
  locale: Locale,
  filter: BookingHistoryFilter,
): Promise<{ bookings: AccountBookingViewModel[]; error: string | null; demo: boolean }> {
  const result = await apiGet<BookingResponse[]>(request, '/public/my-bookings', accessToken, {
    schema: z.array(bookingResponseSchema),
  });

  if (result.ok && result.data?.length) {
    const bookings = result.data.map((item) => toAccountBookingViewModel(item, locale));
    return {
      bookings: bookings.filter((item) => bookingMatchesFilter(item, filter)),
      error: null,
      demo: false,
    };
  }

  if (!storefrontEnv.production) {
    const bookings = ACCOUNT_BOOKING_LIST_FIXTURES.map((fixture) =>
      toAccountBookingViewModel(fixture.booking, locale, fixture.presentation),
    );
    return {
      bookings: bookings.filter((item) => bookingMatchesFilter(item, filter)),
      error: null,
      demo: true,
    };
  }

  return {
    bookings: [],
    error: result.ok ? null : (result.error ?? 'BOOKINGS_UNAVAILABLE'),
    demo: false,
  };
}

export async function loadAccountBooking(
  request: Request,
  code: string,
  locale: Locale,
): Promise<AccountBookingViewModel | null> {
  const normalizedCode = code.trim().toUpperCase();
  const fixture = !storefrontEnv.production ? ACCOUNT_BOOKING_FIXTURES[normalizedCode] : undefined;
  if (fixture) {
    return toAccountBookingViewModel(fixture.booking, locale, fixture.presentation);
  }

  const booking = await fetchBookingByCode(request, normalizedCode);
  return booking ? toAccountBookingViewModel(booking, locale) : null;
}
