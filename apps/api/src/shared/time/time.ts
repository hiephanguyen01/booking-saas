/**
 * Time convention (TONG-QUAN.md §18): the DB stores timestamptz in UTC only;
 * tenant/resource timezones apply at the presentation and slot-computation
 * edges. IANA zone math uses Intl — no timezone library dependency.
 */
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function utcNow(): Date {
  return new Date();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Wall-clock parts of a UTC instant in a given IANA timezone. */
export function wallClockInZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: weekdays.indexOf(get('weekday')),
  };
}

/** UTC instant for a wall-clock time in a zone (e.g. "18:00 in Ho Chi Minh"). */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const { year, month, day, hour = 0, minute = 0 } = parts;
  // first guess: treat the wall clock as UTC, then correct by the zone offset
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const wall = wallClockInZone(new Date(guess), timeZone);
    const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - wallAsUtc;
  }
  return new Date(guess);
}

export function formatInZone(
  date: Date,
  timeZone: string,
  locale: 'vi' | 'en' = 'vi',
): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
