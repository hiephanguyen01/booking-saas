import { TZ } from './format';

/**
 * Calendar-date math anchored to the VN market timezone (fixed +07:00, no DST).
 * Days are represented as "YYYY-MM-DD" strings; arithmetic runs in a noon-UTC
 * space so it never rolls across a day boundary when formatted back in TZ.
 */

const OFFSET = '+07:00';

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function toDayString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** The Monday (week start) of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const weekday = d.getUTCDay(); // 0=Sun … 6=Sat
  const back = (weekday + 6) % 7; // days since Monday
  return addDays(d, -back);
}

/** The 7 dates Mon…Sun of the week starting at `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Today's calendar date in TZ, as "YYYY-MM-DD". */
export function todayString(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** UTC ISO instant (…Z) for the start of a calendar day in TZ - feed query bound. */
export function startOfDayUtc(dayString: string): string {
  return new Date(`${dayString}T00:00:00${OFFSET}`).toISOString();
}
