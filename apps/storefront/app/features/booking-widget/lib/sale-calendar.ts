import type { AvailabilityCalendarDay, AvailabilityCalendarResponse } from '@booking/contracts';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Return the literal calendar month containing a YYYY-MM-DD date. */
export function monthOf(date: string): string {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError('Expected a YYYY-MM-DD calendar date');

  const month = `${match[1]}-${match[2]}`;
  const { from, to } = monthBounds(month);
  if (date < from || date > to) throw new RangeError('Expected a valid calendar date');

  return month;
}

/** Inclusive literal date bounds for a YYYY-MM month, calculated in UTC. */
export function monthBounds(month: string): { from: string; to: string } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new RangeError('Expected a YYYY-MM calendar month');

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDate = new Date(0);
  lastDate.setUTCHours(0, 0, 0, 0);
  lastDate.setUTCFullYear(year, monthNumber, 0);
  const lastDay = String(lastDate.getUTCDate()).padStart(2, '0');

  return { from: `${month}-01`, to: `${month}-${lastDay}` };
}

export function calendarDaysByDate(
  response: AvailabilityCalendarResponse | null,
): ReadonlyMap<string, AvailabilityCalendarDay> {
  return new Map(response?.days.map((day) => [day.date, day]) ?? []);
}
