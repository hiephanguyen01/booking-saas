import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  BookingMode,
  ListingResponse,
  PricingRuleResponse,
} from '@booking/contracts';

/**
 * Pure helpers for the partner listing calendar (`?tab=calendar`). No JSX, no
 * fetching — the grid maths, the three-layer availability resolution, and the
 * Vietnamese date wording, kept in one place so the month grid, the day dialog
 * and the range dialog can never disagree about what a date means.
 */

/** The two booking modes the calendar can render. */
export type CalendarMode = Extract<BookingMode, 'hourly' | 'daily'>;

export const WEEKDAY_HEADS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const WEEKDAY_NAME = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Shift a "YYYY-MM" month by whole months. */
export function monthShift(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month's grid cells, Monday-first: leading `null`s then each date. */
export function calendarDays(month: string): Array<string | null> {
  const [year, value] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const first = new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
  const mondayOffset = (first + 6) % 7;
  return [
    ...Array.from<null>({ length: mondayOffset }).fill(null),
    ...Array.from({ length: count }, (_, index) => isoDate(year, value, index + 1)),
  ];
}

/** 0=Sun … 6=Sat. Noon UTC so the date never rolls under a zone shift. */
export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** "2026-07-31" → "Thứ sáu, 31/07/2026". */
export function formatDayLong(date: string): string {
  const [year, month, day] = date.split('-');
  return `${WEEKDAY_NAME[weekday(date)]}, ${day}/${month}/${year}`;
}

/** "2026-07-31" → "31/07". */
export function formatDayShort(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/** Inclusive list of dates between two bounds, in order. */
export function datesBetween(from: string, to: string): string[] {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  let cursor = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  while (cursor <= last) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return out;
}

/** Does a date-scoped pricing rule cover this date? Recurring rules never do. */
export function dateMatches(rule: PricingRuleResponse, date: string): boolean {
  if (rule.ruleType === 'date_time_range') return rule.params.date === date;
  if (rule.ruleType !== 'date_range') return false;
  return date >= String(rule.params.from) && date <= String(rule.params.to);
}

/** Weekdays a recurring rule covers; an absent `days` on `time_range` means all seven. */
function recurringDays(rule: PricingRuleResponse): number[] {
  const days = rule.params.days;
  return Array.isArray(days) && days.length > 0 ? days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Rules that decide a cell's displayed price.
 *
 * For `daily` a `day_of_week` rule is included, because a night is one priced
 * unit and the rule either covers it or does not — the cell can state the real
 * price. For `hourly` it is deliberately excluded: a day holds many units at
 * different prices, so folding a recurring rule into one number would print a
 * figure no customer ever pays. Use {@link hasRecurringOn} to flag those days
 * instead.
 *
 * `time_range` never participates — it prices hours, and the UI only offers it
 * on hourly listings.
 */
export function pricingRulesForCell(
  date: string,
  mode: CalendarMode,
  rules: PricingRuleResponse[],
): PricingRuleResponse[] {
  const dated = rules.filter((rule) => rule.bookingMode === mode && dateMatches(rule, date));
  if (mode !== 'daily') return dated;
  // A date override outranks a weekly rule (PRICING_RULE_PRIORITY), so once one
  // exists it alone decides the cell.
  if (dated.length > 0) return dated;
  return rules.filter(
    (rule) =>
      rule.bookingMode === mode &&
      rule.ruleType === 'day_of_week' &&
      recurringDays(rule).includes(weekday(date)),
  );
}

/** Is a repeating rule in force on this date, whatever the cell shows? */
export function hasRecurringOn(
  date: string,
  mode: CalendarMode,
  rules: PricingRuleResponse[],
): boolean {
  return rules.some(
    (rule) =>
      rule.bookingMode === mode &&
      (rule.ruleType === 'day_of_week' || rule.ruleType === 'time_range') &&
      recurringDays(rule).includes(weekday(date)),
  );
}

/** The listing's per-unit base price for a mode, or null when unset. */
export function defaultPrice(listing: ListingResponse, mode: CalendarMode): string | null {
  const config = listing.modeConfig[mode] as Record<string, unknown> | undefined;
  const value = mode === 'hourly' ? config?.basePrice : config?.basePricePerNight;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/**
 * How a date is closed, if it is. The two closures need different fixes — an
 * override is undone on this screen, a weekly gap is fixed in "Lịch tuần" — so
 * they must stay distinguishable everywhere.
 */
export type ClosureState = 'open' | 'custom_hours' | 'closed_override' | 'closed_weekly';

export function closureStateOf(
  date: string,
  mode: CalendarMode,
  weeklyRules: AvailabilityRuleResponse[],
  exception: AvailabilityExceptionResponse | undefined,
): ClosureState {
  if (exception?.type === 'closed') return 'closed_override';
  if (exception?.type === 'custom_hours') return 'custom_hours';
  // An empty weekly schedule means opposite things per mode, matching the
  // availability engine: no hourly rule = nothing open, no daily rule = all open.
  const openByWeek =
    mode === 'daily'
      ? weeklyRules.length === 0 || weeklyRules.some((rule) => rule.dayOfWeek === weekday(date))
      : weeklyRules.some((rule) => rule.dayOfWeek === weekday(date));
  return openByWeek ? 'open' : 'closed_weekly';
}

export function isClosed(state: ClosureState): boolean {
  return state === 'closed_override' || state === 'closed_weekly';
}

/** Resource-local open windows for a date, resolved across the two layers. */
export function openWindowsFor(
  date: string,
  weeklyRules: AvailabilityRuleResponse[],
  exception: AvailabilityExceptionResponse | undefined,
): { from: string; to: string }[] {
  if (exception?.type === 'closed') return [];
  if (exception?.type === 'custom_hours') {
    // `windows` is the source of truth; the pair is a mirror kept for rows
    // written before multi-window days existed.
    if (exception.windows.length > 0) {
      return exception.windows
        .map((window) => ({ from: window.openTime, to: window.closeTime }))
        .sort((a, b) => a.from.localeCompare(b.from));
    }
    if (exception.openTime && exception.closeTime) {
      return [{ from: exception.openTime, to: exception.closeTime }];
    }
  }
  return weeklyRules
    .filter((rule) => rule.dayOfWeek === weekday(date))
    .map((rule) => ({ from: rule.openTime, to: rule.closeTime }));
}

/**
 * Bookings that still hold the resource, grouped by their resource-local start
 * date. Only these statuses block the calendar — the same set the availability
 * engine treats as busy — so a cancelled booking never scares a partner off
 * closing a day.
 */
export const HOLDING_STATUSES = ['pending_payment', 'pending_approval', 'confirmed'] as const;

export function holdsResource(booking: { status: string }): boolean {
  return (HOLDING_STATUSES as readonly string[]).includes(booking.status);
}

export function bucketBookingsByDay<T extends { startUtc: string }>(
  bookings: T[],
  toDay: (iso: string) => string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const booking of bookings) {
    const day = toDay(booking.startUtc);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(booking);
    else byDay.set(day, [booking]);
  }
  return byDay;
}

/** The lowest effective price among a date's rules, or null when it has none. */
export function cheapestOf(rules: PricingRuleResponse[]): string | null {
  return rules.reduce<string | null>((low, rule) => {
    const value = rule.salePrice ?? rule.price;
    return low === null || BigInt(value) < BigInt(low) ? value : low;
  }, null);
}
