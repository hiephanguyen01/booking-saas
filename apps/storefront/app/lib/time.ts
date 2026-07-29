/**
 * Timezone helpers (§18) — the DB/API speak UTC ISO; the storefront shows and
 * accepts wall-clock times in the resource/tenant zone. Uses `Intl` only (no tz
 * lib). Correct for fixed-offset zones like `Asia/Ho_Chi_Minh`; DST zones have a
 * rare ambiguous-hour edge we accept for Phase 1 (VN has no DST).
 */
import { intlLocale } from './intl';

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

/** ms to add to a UTC instant to get the given zone's wall time (e.g. +7h for ICT). */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/** Convert a wall-clock `YYYY-MM-DD` + `HH:MM` in `tz` to a UTC ISO instant. */
export function zonedToUtcIso(dateStr: string, timeStr: string, tz: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - offset).toISOString();
}

/**
 * `Intl.DateTimeFormat` construction is expensive and the display helpers below
 * are called once per slot / per booking inside render loops, so every formatter
 * in this module is built once per (shape, locale, timezone) and reused.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  key: string,
  build: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  const cached = formatters.get(key);
  if (cached) return cached;

  const formatter = build();
  formatters.set(key, formatter);
  return formatter;
}

/** `HH:MM` wall time of a UTC instant in `tz`. */
export function timeInTz(utcIso: string, tz: string): string {
  return cachedFormatter(
    `clock:${tz}`,
    () =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
  ).format(new Date(utcIso));
}

/** e.g. "T4, 20 thg 7" — a short date label for a UTC instant or literal date. */
export function dateLabelInTz(utcIsoOrDate: string, tz: string, locale: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(utcIsoOrDate);
  const value = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(utcIsoOrDate);
  // A literal `YYYY-MM-DD` is a calendar day, not an instant: read it back in UTC
  // so no timezone can shift it to the neighbouring day.
  const timeZone = dateOnly ? 'UTC' : tz;
  const tag = intlLocale(locale);
  return cachedFormatter(
    `shortDate:${tag}:${timeZone}`,
    () =>
      new Intl.DateTimeFormat(tag, {
        timeZone,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      }),
  ).format(value);
}

/**
 * The booking surfaces' date/time pair — "Monday, 20/07/2026" and "14:00".
 *
 * Distinct from `timeInTz`, which is the machine-ish `HH:MM` used for form values.
 * These widen `en` to `en-US` (month-first) because that is what the account
 * booking list, booking detail and review cards have always rendered; see
 * `~/lib/intl`. Formatters are cached because both are called once per booking in
 * lists that routinely hold dozens.
 */
function bookingFormatter(
  kind: 'longDate' | 'time',
  tz: string,
  locale: string,
): Intl.DateTimeFormat {
  const tag = intlLocale(locale, 'en-US');
  return cachedFormatter(
    `${kind}:${tag}:${tz}`,
    () =>
      new Intl.DateTimeFormat(
        tag,
        kind === 'longDate'
          ? { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz }
          : { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz },
      ),
  );
}

/** e.g. "Thứ Hai, 20/07/2026" — the long booking date of a UTC instant in `tz`. */
export function bookingDateInTz(utcIso: string, tz: string, locale: string): string {
  return bookingFormatter('longDate', tz, locale).format(new Date(utcIso));
}

/** e.g. "14:00" — the wall-clock time of a UTC instant in `tz`. */
export function bookingTimeInTz(utcIso: string, tz: string, locale: string): string {
  return bookingFormatter('time', tz, locale).format(new Date(utcIso));
}

/** Today's `YYYY-MM-DD` in `tz`, optionally anchored to a supplied instant. */
export function todayInTz(tz: string, at = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Calendar date of a UTC instant in `tz`, as `YYYY-MM-DD`. */
export function dateOnlyInTz(utcIso: string, tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(utcIso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** `YYYY-MM-DD` → local `Date` at noon (avoids off-by-one from tz when feeding a calendar). */
export function dateOnlyToLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Local `Date` → `YYYY-MM-DD` (calendar-day components, no tz shift). */
export function localToDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole nights between two `YYYY-MM-DD` dates. */
export function nightsBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Positive duration in hours, rounded to two decimals for 15/30-minute grids. */
export function hoursBetween(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round(((end - start) / 3_600_000) * 100) / 100;
}

/** Same-day wall-clock duration for search values such as `09:00` → `14:00`. */
export function clockHoursBetween(startTime: string, endTime: string): number | null {
  return hoursBetween(`1970-01-01T${startTime}:00Z`, `1970-01-01T${endTime}:00Z`);
}

/** Add days to a `YYYY-MM-DD` string, returning `YYYY-MM-DD`. */
export function addDays(dateStr: string, days: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
