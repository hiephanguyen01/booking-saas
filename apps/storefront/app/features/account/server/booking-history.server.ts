import {
  bookingResponseSchema,
  customerDisputeStateSchema,
  type BookingResponse,
  type CustomerDisputeState,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { z } from 'zod';
import { apiGet } from '~/lib/server/api.server';
import { fetchBookingByCode } from '~/features/booking/server/booking.server';
import {
  type BookingDetailViewModel,
  toBookingDetailViewModel,
} from '~/features/booking/lib/booking-detail-model';
import {
  bookingHistoryCounts,
  bookingMatchesFilter,
  type BookingHistoryCounts,
  type BookingHistoryFilter,
} from '~/features/account/lib/booking-history';
import { loadCustomerReviewsByBooking } from './customer-reviews.server';
import { apiPaths } from '~/constants/api-paths';

/** Dispute eligibility keyed by booking id, for the list's action buttons. */
export type DisputeStateMap = Record<
  string,
  { canOpenDispute: boolean; disputeUntil: string | null }
>;

export async function loadAccountBookings(
  request: Request,
  accessToken: string,
  locale: Locale,
  filter: BookingHistoryFilter,
): Promise<{
  bookings: BookingDetailViewModel[];
  disputeStates: DisputeStateMap;
  error: string | null;
  counts: BookingHistoryCounts;
}> {
  const [result, reviews, disputes] = await Promise.all([
    apiGet<BookingResponse[]>(request, apiPaths.public.myBookings, accessToken, {
      schema: z.array(bookingResponseSchema),
    }),
    loadCustomerReviewsByBooking(request, accessToken),
    // One bulk read rather than one per row. A failure here only costs the
    // dispute button, so the list still renders without it.
    apiGet<CustomerDisputeState[]>(request, apiPaths.customer.financeDisputeStates, accessToken, {
      schema: z.array(customerDisputeStateSchema),
    }),
  ]);

  const disputeStates: DisputeStateMap = {};
  if (disputes.ok) {
    for (const state of disputes.data ?? []) {
      disputeStates[state.bookingId] = {
        canOpenDispute: state.canOpenDispute,
        disputeUntil: state.disputeUntil,
      };
    }
  }

  if (result.ok) {
    const bookings = (result.data ?? []).map((item) =>
      toBookingDetailViewModel(item, locale, reviews.get(item.id) ?? null),
    );
    return {
      bookings: bookings.filter((item) => bookingMatchesFilter(item, filter)),
      disputeStates,
      error: null,
      counts: bookingHistoryCounts(bookings),
    };
  }

  return {
    bookings: [],
    disputeStates,
    error: result.error ?? 'BOOKINGS_UNAVAILABLE',
    counts: bookingHistoryCounts([]),
  };
}

export async function loadAccountBooking(
  request: Request,
  code: string,
  locale: Locale,
  accessToken: string,
): Promise<BookingDetailViewModel | null> {
  const normalizedCode = code.trim().toUpperCase();
  const [booking, reviews] = await Promise.all([
    fetchBookingByCode(request, normalizedCode),
    loadCustomerReviewsByBooking(request, accessToken),
  ]);
  return booking
    ? toBookingDetailViewModel(booking, locale, reviews.get(booking.id) ?? null)
    : null;
}
