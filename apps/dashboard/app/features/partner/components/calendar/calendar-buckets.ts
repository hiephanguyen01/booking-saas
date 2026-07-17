import type { PartnerCalendarBookingResponse } from '@booking/contracts';
import { dayKey, minutesOfDay } from '~/lib/format';

/** Working-window bounds (hours) the day grid always spans at minimum. */
export const DAY_START = 8;
export const DAY_END = 18;

/** Bookings keyed by their VN calendar day, each day sorted by start time. */
export function bucketByDay(
  bookings: PartnerCalendarBookingResponse[],
): Map<string, PartnerCalendarBookingResponse[]> {
  const map = new Map<string, PartnerCalendarBookingResponse[]>();
  for (const b of bookings) {
    const key = dayKey(b.startUtc);
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }
  return map;
}

/** Timed (hourly) bookings keyed by the hour-of-day they start in. */
export function bucketByHour(
  timed: PartnerCalendarBookingResponse[],
): Map<number, PartnerCalendarBookingResponse[]> {
  const map = new Map<number, PartnerCalendarBookingResponse[]>();
  for (const b of timed) {
    const h = Math.floor(minutesOfDay(b.startUtc) / 60);
    const list = map.get(h) ?? [];
    list.push(b);
    map.set(h, list);
  }
  return map;
}

/**
 * The hour rows the day grid renders: at least DAY_START–DAY_END, widened to
 * cover every timed booking (never past 23h). With no timed bookings the grid
 * shows an empty 07:00–19:00 canvas.
 */
export function deriveHourRows(timed: PartnerCalendarBookingResponse[]): number[] {
  if (timed.length === 0) {
    return hourRange(DAY_START - 1, DAY_END + 1);
  }
  const mins = timed.map((b) => minutesOfDay(b.startUtc));
  const from = Math.floor(Math.min(...mins, DAY_START * 60) / 60);
  const to = Math.min(23, Math.ceil(Math.max(...mins, DAY_END * 60) / 60));
  return hourRange(from, to);
}

function hourRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
