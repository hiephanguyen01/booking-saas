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
  /** The row cap was hit — the KPIs cover the latest {@link BOOKING_LIST_LIMIT} only. */
  capped: boolean;
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
