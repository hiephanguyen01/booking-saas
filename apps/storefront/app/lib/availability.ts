import type { AvailabilityResponse, DayAvailability } from '@booking/contracts';

export type PricedDayAvailability = DayAvailability & { price: string; regularPrice: string };

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

/**
 * Exact daily units in a selected stay. `to` is the checkout date and is therefore
 * excluded. Callers may present these unit prices, but the server quote remains the
 * only source of a multi-night total.
 */
export function dailyAvailabilityInRange(
  availability: AvailabilityResponse | null | undefined,
  from: string | null | undefined,
  to?: string | null,
): PricedDayAvailability[] {
  if (availability?.mode !== 'daily' || !from) return [];

  return availability.days.filter(
    (day): day is PricedDayAvailability =>
      day.status === 'available' &&
      day.price !== null &&
      day.regularPrice !== null &&
      day.date >= from &&
      (!to || day.date < to),
  );
}
