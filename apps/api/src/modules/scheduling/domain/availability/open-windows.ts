import { zonedTimeToUtc } from '../../../../shared/time/time';
import { parseDate, weekdayOf } from './date-util';
import type { Interval } from './interval';

/** A weekly opening-hours rule (§7.4). */
export interface WeeklyRule {
  dayOfWeek: number;
  openTime: string; // HH:MM, resource-local
  closeTime: string;
}

/** A date-specific exception (§7.4). `closed` shuts the day; `custom_hours` overrides. */
export interface DateException {
  type: 'closed' | 'custom_hours';
  openTime?: string | null;
  closeTime?: string | null;
}

/**
 * Resolve a calendar date's open intervals as UTC `[start,end)`, in the
 * resource timezone (§9.1). Weekly rules for the date's weekday are used unless
 * an exception overrides — `closed` yields no windows, `custom_hours` replaces
 * them. Timezone/DST correctness comes from {@link zonedTimeToUtc}.
 */
export function openWindowsForDate(
  date: string,
  timezone: string,
  rules: readonly WeeklyRule[],
  exception?: DateException | null,
): Interval[] {
  if (exception?.type === 'closed') return [];

  let windows: { openTime: string; closeTime: string }[];
  if (exception?.type === 'custom_hours' && exception.openTime && exception.closeTime) {
    windows = [{ openTime: exception.openTime, closeTime: exception.closeTime }];
  } else {
    const weekday = weekdayOf(date);
    windows = rules
      .filter((r) => r.dayOfWeek === weekday)
      .map((r) => ({ openTime: r.openTime, closeTime: r.closeTime }));
  }

  const { year, month, day } = parseDate(date);
  return windows
    .map((w) => {
      const [oh, om] = w.openTime.split(':').map(Number);
      const [ch, cm] = w.closeTime.split(':').map(Number);
      return {
        start: zonedTimeToUtc({ year, month, day, hour: oh, minute: om }, timezone),
        end: zonedTimeToUtc({ year, month, day, hour: ch, minute: cm }, timezone),
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
