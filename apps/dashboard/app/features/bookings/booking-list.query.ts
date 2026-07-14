import { queryOptions } from '@tanstack/react-query';
import axios from 'axios';
import type { BookingResponse } from '@booking/contracts';

export const bookingStatuses = [
  'all',
  'pending_approval',
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const;

export type BookingStatusFilter = (typeof bookingStatuses)[number];

export interface BookingSummary {
  total: number;
  active: number;
  completed: number;
  revenue: string;
}

export interface BookingListData {
  items: BookingResponse[];
  summary: BookingSummary;
}

export function parseBookingStatus(value: string | null): BookingStatusFilter {
  return bookingStatuses.includes(value as BookingStatusFilter)
    ? (value as BookingStatusFilter)
    : 'all';
}

export function bookingListKey(tenantId: string, status: BookingStatusFilter) {
  return ['bookings', 'tenant', tenantId, 'list', { status }] as const;
}

export function bookingListResourcePath(status: BookingStatusFilter): string {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  const search = params.toString();
  return `/tenant/resources/bookings${search ? `?${search}` : ''}`;
}

export function bookingListQueryOptions(tenantId: string, status: BookingStatusFilter) {
  return queryOptions({
    queryKey: bookingListKey(tenantId, status),
    queryFn: async ({ signal }) => {
      const response = await axios.get<BookingListData>(bookingListResourcePath(status), {
        signal,
        headers: { accept: 'application/json' },
        withCredentials: true,
      });
      return response.data;
    },
    staleTime: 30_000,
  });
}
