import type { AvailabilityMode, AvailabilityResponse } from '@booking/contracts';

/**
 * The booking modes an availability query can be issued for. Two features read
 * this (the listing loader and the booking panel), so it lives here rather than
 * being re-declared in each.
 */
export const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

/**
 * The calendar dates a daily availability response reports as open, as a `Set` so
 * membership checks over a whole range stay O(1). Hourly and inventory responses have
 * no open dates, so they yield an empty set — callers can pass any response without
 * first narrowing the mode.
 *
 * Not to be confused with `~/lib/tenant-availability`, which is about whether the
 * tenant's storefront is live at all.
 */
export function openDailyDates(availability: AvailabilityResponse | null | undefined): Set<string> {
  return new Set(
    availability?.mode === 'daily'
      ? availability.days.filter((day) => day.status === 'available').map((day) => day.date)
      : [],
  );
}
