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

export interface BookingListData {
  items: BookingResponse[];
  /** Total rows matching the active status filter (server count, for the pager). */
  total: number;
}

export function parseBookingStatus(value: string | null): BookingStatusFilter {
  return bookingStatuses.includes(value as BookingStatusFilter)
    ? (value as BookingStatusFilter)
    : 'all';
}
