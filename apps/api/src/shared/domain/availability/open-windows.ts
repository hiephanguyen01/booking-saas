import { zonedTimeToUtc } from '../../time/time';
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

/** An open window as resource-local wall-clock `HH:MM`, before any UTC mapping. */
export interface LocalWindow {
  openTime: string;
  closeTime: string;
}

/**
 * Resolve a calendar date's open windows as resource-local `HH:MM` — the
 * wall-clock half of {@link openWindowsForDate}, shared so the availability
 * engine and the pricing-rule guard can never disagree about which hours a date
 * is open. `closed` yields none; `custom_hours` replaces the weekday's rules.
 */
export function localOpenWindowsForDate(
  date: string,
  rules: readonly WeeklyRule[],
  exception?: DateException | null,
): LocalWindow[] {
  if (exception?.type === 'closed') return [];
  if (exception?.type === 'custom_hours' && exception.openTime && exception.closeTime) {
    return [{ openTime: exception.openTime, closeTime: exception.closeTime }];
  }
  const weekday = weekdayOf(date);
  return rules
    .filter((r) => r.dayOfWeek === weekday)
    .map((r) => ({ openTime: r.openTime, closeTime: r.closeTime }));
}

/**
 * Does `[from,to]` (resource-local `HH:MM`) sit wholly inside one open window?
 * A span straddling two windows separated by a break is NOT contained — the
 * break is closed time.
 */
export function windowFitsOpenHours(
  windows: readonly LocalWindow[],
  from: string,
  to: string,
): boolean {
  return windows.some((w) => from >= w.openTime && to <= w.closeTime);
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
  const windows = localOpenWindowsForDate(date, rules, exception);
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
