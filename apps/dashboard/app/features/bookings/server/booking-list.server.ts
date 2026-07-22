import type { BookingResponse, Paginated } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import type { BookingListData, BookingStatusFilter } from '../lib/booking-list';

/**
 * One page of the tenant booking overview. `status`/`page`/`pageSize` are honoured
 * SERVER-side (the backend counts + filters the whole dataset) — the returned
 * `total` drives the pager. The KPI tiles come from `/tenant/bookings/partner-stats`
 * (a tenant-wide aggregate), never derived from this page.
 */
export async function fetchBookingList(
  auth: ApiAuth,
  status: BookingStatusFilter,
  page: number,
  pageSize: number,
  signal: AbortSignal,
  apiFilters: Record<string, string | undefined> = {},
): Promise<BookingListData> {
  const cleanFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(apiFilters)) {
    if (value) cleanFilters[key] = value;
  }
  const result = await apiGet<Paginated<BookingResponse>>('/tenant/bookings', auth, {
    signal,
    query: { page, pageSize, ...cleanFilters, ...(status === 'all' ? {} : { status }) },
  });
  const data = unwrapApiResult(result, 'Không tải được đặt chỗ.');
  return { items: data.items, total: data.total };
}
