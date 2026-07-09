/**
 * Calendar-date helpers for the availability engine. A calendar date's weekday
 * is timezone-independent, so it is computed in UTC to avoid zone confusion; the
 * wall-clock → UTC conversion for open hours happens in open-windows.ts.
 */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDate(date: string): DateParts {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** 0=Sun … 6=Sat for a `YYYY-MM-DD` calendar date. */
export function weekdayOf(date: string): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Inclusive list of `YYYY-MM-DD` dates from `from` to `to`. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const s = parseDate(from);
  const e = parseDate(to);
  let cursor = Date.UTC(s.year, s.month - 1, s.day);
  const end = Date.UTC(e.year, e.month - 1, e.day);
  while (cursor <= end) {
    const d = new Date(cursor);
    const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    out.push(iso);
    cursor += 86_400_000;
  }
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
