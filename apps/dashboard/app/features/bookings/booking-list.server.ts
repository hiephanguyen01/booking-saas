import type { BookingResponse } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import type { BookingListData, BookingStatusFilter } from './booking-list.query';

/**
 * The backend clamps `/tenant/bookings` to at most 200 rows. We request that cap
 * so the KPI tiles cover as much as possible; if we still hit it, `summary.capped`
 * is set so the tiles are labelled "trong 200 gần nhất" rather than lying about a
 * cumulative total.
 */
export const BOOKING_LIST_LIMIT = 200;

export async function fetchBookingList(
  auth: ApiAuth,
  status: BookingStatusFilter,
  signal: AbortSignal,
): Promise<BookingListData> {
  const result = await apiGet<BookingResponse[]>('/tenant/bookings', auth, {
    signal,
    query: { limit: BOOKING_LIST_LIMIT },
  });
  const all = unwrapApiResult(result, 'Không tải được đặt chỗ.');
  const items = status === 'all' ? all : all.filter((booking) => booking.status === status);
  const active = all.filter(
    (booking) => booking.status === 'confirmed' || booking.status === 'pending_approval',
  ).length;
  const completed = all.filter((booking) => booking.status === 'completed').length;
  const revenue = all
    .filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
    .reduce((sum, booking) => sum + BigInt(booking.finalAmount || '0'), 0n);

  return {
    items,
    summary: {
      total: all.length,
      active,
      completed,
      revenue: revenue.toString(),
      capped: all.length >= BOOKING_LIST_LIMIT,
    },
  };
}
