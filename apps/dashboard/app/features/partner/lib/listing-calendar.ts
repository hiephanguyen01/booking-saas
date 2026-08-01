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

const WEEKDAY_NAME = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

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

/**
 * Campaign-bearing rules that can affect a date, including recurring hourly
 * rules which the month cell intentionally excludes from its headline price.
 */
export function campaignRulesForCell(
  date: string,
  mode: CalendarMode,
  rules: PricingRuleResponse[],
): PricingRuleResponse[] {
  if (mode === 'daily') return pricingRulesForCell(date, mode, rules);
  const candidates = rules.filter(
    (rule) =>
      rule.bookingMode === mode &&
      (dateMatches(rule, date) ||
        ((rule.ruleType === 'day_of_week' || rule.ruleType === 'time_range') &&
          recurringDays(rule).includes(weekday(date)))),
  );
  const spans = candidates.flatMap((rule) => {
    const span = hourlyRuleSpan(rule);
    return span ? [{ rule, ...span }] : [];
  });
  const boundaries = [...new Set(spans.flatMap(({ from, to }) => [from, to]))].sort(
    (a, b) => a - b,
  );
  const effective = new Set<PricingRuleResponse>();

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index];
    const winner = spans
      .filter(({ from, to }) => segmentStart >= from && segmentStart < to)
      .reduce<PricingRuleResponse | undefined>(
        (best, { rule }) => (!best || rule.priority > best.priority ? rule : best),
        undefined,
      );
    if (winner) effective.add(winner);
  }

  return candidates.filter((rule) => effective.has(rule));
}

function minuteOfClock(value: unknown): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function hourlyRuleSpan(rule: PricingRuleResponse): { from: number; to: number } | null {
  if (rule.ruleType === 'day_of_week' || rule.ruleType === 'date_range') {
    return { from: 0, to: 24 * 60 };
  }
  if (rule.ruleType !== 'time_range' && rule.ruleType !== 'date_time_range') return null;
  const from = minuteOfClock(rule.params.from);
  const to = minuteOfClock(rule.params.to);
  return from !== null && to !== null && from < to ? { from, to } : null;
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

/**
 * A stored campaign instant back as the `YYYY-MM-DD` a date input expects.
 *
 * The window is half-open, so `saleEndsAt` is midnight of the day AFTER the last
 * day of the campaign — {@link campaignEndDate} shifts it back so the partner
 * sees the date they actually typed.
 */
export function dateOnly(instant: string | null | undefined): string | undefined {
  return instant ? dayKeyInTz(instant) : undefined;
}

export function campaignEndDate(instant: string | null | undefined): string | undefined {
  if (!instant) return undefined;
  return dayKeyInTz(new Date(Date.parse(instant) - 86_400_000).toISOString());
}

function dayKeyInTz(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Is a rule's sale campaign running right now? */
export function campaignState(
  rule: PricingRuleResponse,
  now: number = Date.now(),
): 'none' | 'scheduled' | 'running' | 'ended' {
  if (!rule.salePrice) return 'none';
  if (rule.saleStartsAt && now < Date.parse(rule.saleStartsAt)) return 'scheduled';
  if (rule.saleEndsAt && now >= Date.parse(rule.saleEndsAt)) return 'ended';
  return 'running';
}

export interface CampaignPresentation {
  state: 'none' | 'scheduled' | 'running' | 'ended';
  coverage: 'full' | 'partial' | null;
  regularPrice: string | null;
  salePrice: string | null;
  label: string | null;
}

/** HTML `max` for a positive sale price that must stay below the regular price. */
export function maximumSalePrice(regularPrice: string): string | undefined {
  if (!/^\d+$/.test(regularPrice)) return undefined;
  const value = BigInt(regularPrice);
  return value > 0n ? String(value - 1n) : '0';
}

/**
 * One truthful campaign summary for a partner calendar unit.
 *
 * Running campaigns win over future campaigns, which win over campaign history.
 * A time-scoped rule can only describe part of an hourly day, while a mixture of
 * sale and non-sale rules is also partial. Scheduled/ended campaigns deliberately
 * return no sale price: it is useful context, but it is not what a customer pays.
 */
export function campaignPresentationOf(
  rules: readonly PricingRuleResponse[],
  mode: CalendarMode,
  now: number = Date.now(),
): CampaignPresentation {
  const states = rules.map((rule) => ({ rule, state: campaignState(rule, now) }));
  const state = (['running', 'scheduled', 'ended'] as const).find((candidate) =>
    states.some((item) => item.state === candidate),
  );
  if (!state) {
    return { state: 'none', coverage: null, regularPrice: null, salePrice: null, label: null };
  }

  const campaignRules = states.filter((item) => item.state === state);
  const representative = campaignRules.reduce<PricingRuleResponse | null>((best, item) => {
    if (!best) return item.rule;
    const candidateSale = BigInt(item.rule.salePrice ?? item.rule.price);
    const bestSale = BigInt(best.salePrice ?? best.price);
    return candidateSale < bestSale ? item.rule : best;
  }, null);
  const timeScoped =
    mode === 'hourly' &&
    campaignRules.some(
      ({ rule }) => rule.ruleType === 'time_range' || rule.ruleType === 'date_time_range',
    );
  const everyUnitMatches =
    rules.length > 0 &&
    states.every((item) => item.state === state && item.rule.salePrice !== null);

  return {
    state,
    coverage: timeScoped || !everyUnitMatches ? 'partial' : 'full',
    regularPrice: representative?.price ?? null,
    salePrice: state === 'running' ? (representative?.salePrice ?? null) : null,
    label: representative?.campaignLabel?.trim() || null,
  };
}

/** Fallback hour span when a whole week is closed — a grid still needs a shape. */
const DEFAULT_HOUR_ROWS: [number, number] = [8, 20];

/**
 * The hour rows a week grid spans: the union of every day's opening hours.
 *
 * Derived from OPENING HOURS, not from bookings — a week with no bookings still
 * has to show the hours the partner sells, which is the whole point of the view.
 * Clamped to 0–23 and rounded outwards so a window like 08:30–20:30 is fully
 * visible.
 */
export function weekHourRows(
  days: string[],
  weeklyRules: AvailabilityRuleResponse[],
  exceptionByDate: Map<string, AvailabilityExceptionResponse>,
): number[] {
  let min = 24;
  let max = 0;
  for (const date of days) {
    for (const window of openWindowsFor(date, weeklyRules, exceptionByDate.get(date))) {
      min = Math.min(min, Math.floor(Number(window.from.slice(0, 2))));
      // A window closing at 20:30 still occupies the 20:00 row; one closing at
      // 20:00 does not.
      const endHour = Number(window.to.slice(0, 2));
      const endMinute = Number(window.to.slice(3, 5));
      max = Math.max(max, endMinute > 0 ? endHour : endHour - 1);
    }
  }
  const [from, to] = min > max ? DEFAULT_HOUR_ROWS : [min, Math.min(23, max)];
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** Is an hour inside any of a date's open windows? */
export function hourIsOpen(
  date: string,
  hour: number,
  weeklyRules: AvailabilityRuleResponse[],
  exception: AvailabilityExceptionResponse | undefined,
): boolean {
  const stamp = `${String(hour).padStart(2, '0')}:00`;
  return openWindowsFor(date, weeklyRules, exception).some(
    (window) => stamp >= window.from && stamp < window.to,
  );
}

/** The highest-priority dated or recurring rule pricing this exact hour. */
export function ruleCoveringHour(
  rules: PricingRuleResponse[],
  date: string,
  hour: number,
  mode: CalendarMode,
): PricingRuleResponse | undefined {
  const stamp = `${String(hour).padStart(2, '0')}:00`;
  return rules
    .filter((rule) => {
      if (rule.bookingMode !== mode) return false;
      if (rule.ruleType === 'date_time_range') {
        return (
          String(rule.params.date) === date &&
          stamp >= String(rule.params.from) &&
          stamp < String(rule.params.to)
        );
      }
      if (rule.ruleType === 'time_range') {
        return (
          recurringDays(rule).includes(weekday(date)) &&
          stamp >= String(rule.params.from) &&
          stamp < String(rule.params.to)
        );
      }
      return rule.ruleType === 'day_of_week' && recurringDays(rule).includes(weekday(date));
    })
    .reduce<PricingRuleResponse | undefined>(
      (winner, rule) => (!winner || rule.priority > winner.priority ? rule : winner),
      undefined,
    );
}

/**
 * The price a rule charges right now — its sale only while the campaign runs.
 * A scheduled or finished campaign must not colour the calendar, or the partner
 * reads a number no guest is being offered.
 */
export function effectivePriceOf(rule: PricingRuleResponse): string {
  return campaignState(rule) === 'running' ? (rule.salePrice ?? rule.price) : rule.price;
}

/** The lowest effective price among a date's rules, or null when it has none. */
export function cheapestOf(rules: PricingRuleResponse[]): string | null {
  return rules.reduce<string | null>((low, rule) => {
    const value = effectivePriceOf(rule);
    return low === null || BigInt(value) < BigInt(low) ? value : low;
  }, null);
}
