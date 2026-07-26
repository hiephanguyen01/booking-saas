const MARKET_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MARKET_UTC_OFFSET_HOURS = 7;
const DAY_MS = 86_400_000;

export interface SubscriptionDateDefaults {
  minDate: string;
  defaultExpiry: string;
}

/** Stable calendar-day values for the subscription form, based on Vietnam time. */
export function getSubscriptionDateDefaults(now: Date = new Date()): SubscriptionDateDefaults {
  const marketDay = marketDateKey(now);
  return {
    minDate: addCalendarDays(marketDay, 1),
    defaultExpiry: addCalendarDays(marketDay, 30),
  };
}

/** Convert a Vietnam calendar day to its final second as an ISO UTC instant. */
export function vietnamCalendarDayEndIso(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(
    Date.UTC(year, month - 1, day + 1, -MARKET_UTC_OFFSET_HOURS, 59, 59, 0),
  );

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day ||
    !Number.isFinite(utc.getTime())
  ) {
    return null;
  }

  return utc.toISOString();
}

function marketDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`;
}
