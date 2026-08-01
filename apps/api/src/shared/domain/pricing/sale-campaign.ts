import type { BookingMode } from '@booking/contracts';
import { wallClockInZone } from '../../time/time';
import { activeSalePrice, type RuleType, type SaleCampaignFields } from './quote-calculator';

/**
 * Advertising a sale campaign on a storefront card (ADR 0009).
 *
 * `quote-calculator` answers "what does THIS booking cost"; this answers the
 * cheaper question a listing card asks — "is a campaign running at all, what is
 * it called, and how long is left to book it". It reads the same rules and the
 * same `activeSalePrice` window gate, so a badge can never disagree with the
 * price the quote will produce.
 *
 * Deliberately NOT a price: a card that shows no dates has no bookable window to
 * price, and the deepest sale across a listing's rules is not a number the
 * visitor can necessarily book. Surfacing it as a price would be bait.
 */

/** The rule fields a campaign badge needs. Both catalog and listing records satisfy it. */
export interface CampaignRuleView extends SaleCampaignFields {
  bookingMode: BookingMode;
  /** VND đồng digit string — the regular price the sale discounts from. */
  price: string;
  /** `ruleType` + `params` are what say WHICH days and hours the sale covers. */
  ruleType: RuleType;
  params: Record<string, unknown>;
}

/**
 * The shape of a campaign in time — which weekdays, which clock band, which
 * calendar span. Derived from the rules' own `params`, so it can be shown before
 * the visitor has picked any dates.
 *
 * A field is populated only when EVERY rule in the campaign agrees on it.
 * Otherwise `varies` is set and the rest is emptied: half an answer ("Sat, Sun"
 * for a campaign that also runs three weekdays) is worse than sending the
 * visitor to the calendar.
 */
export interface SaleSchedule {
  /** 0=Sun…6=Sat, sorted. Empty = not limited by weekday. */
  weekdays: number[];
  /** Shared clock band, `HH:MM`. Null = the campaign is not hour-limited. */
  timeFrom: string | null;
  timeTo: string | null;
  /** Calendar span covered by the campaign's dated rules, `YYYY-MM-DD`. */
  dateFrom: string | null;
  dateTo: string | null;
  /** The rules disagree — the UI should say "see the calendar", not guess. */
  varies: boolean;
}

export interface SaleCampaignSummary {
  /** Partner-authored name in the tenant's own language; null when the sale is unnamed. */
  label: string | null;
  /**
   * Deepest discount across the live rules, integer percent. A real reduction
   * is clamped to 1% so customer-facing copy never advertises a misleading 0%.
   */
  discountPercent: number;
  /**
   * Last calendar day (`YYYY-MM-DD`, resource timezone) a booking still lands
   * inside the campaign; null = unbounded.
   */
  lastBookingDate: string | null;
  /**
   * Whole calendar days left to book, in the resource's timezone. 0 = the
   * campaign ends today. Null when the campaign is unbounded.
   *
   * Both fields are resolved here rather than in the browser so the countdown
   * uses the same clock that decided the campaign is live, and so the SSR render
   * and the hydrated one cannot land on different days.
   */
  daysLeft: number | null;
  /** When the sale applies. Null when the campaign's rules place no limit. */
  schedule: SaleSchedule | null;
}

interface Candidate {
  label: string | null;
  discountPercent: number;
  endsAt: Date | null;
  rules: CampaignRuleView[];
}

/**
 * Internal projection metadata for a multi-listing card. `endsAt` is never a
 * public contract field: it only preserves the final campaign-ranking tie-break
 * when a group/favorite chooses one child campaign to advertise.
 */
export interface SaleCampaignSelection {
  summary: SaleCampaignSummary;
  endsAt: Date | null;
}

/**
 * The campaign to advertise for a listing, or null when none is running.
 *
 * All three display fields describe ONE campaign — the deepest live discount.
 * Mixing them (this campaign's name beside that campaign's deadline) is the
 * failure mode this ordering exists to prevent.
 *
 * @param mode restricts to one booking mode; omit when the surface has not
 *   resolved a mode yet (listing detail before the visitor picks one).
 */
export function summarizeSaleCampaign(
  rules: readonly CampaignRuleView[],
  now: Date,
  timezone: string,
  mode?: BookingMode,
): SaleCampaignSummary | null {
  return selectSaleCampaign(rules, now, timezone, mode)?.summary ?? null;
}

/** Select the public summary plus the private final tie-break metadata. */
export function selectSaleCampaign(
  rules: readonly CampaignRuleView[],
  now: Date,
  timezone: string,
  mode?: BookingMode,
): SaleCampaignSelection | null {
  const liveByLabel = new Map<string | null, CampaignRuleView[]>();
  const discountByRule = new Map<CampaignRuleView, number>();
  for (const rule of rules) {
    if (mode && rule.bookingMode !== mode) continue;
    const sale = activeSalePrice(rule, now);
    if (sale === null) continue;
    const discountPercent = saleDiscountPercent(rule.price, sale);
    if (discountPercent === null) continue;
    const label = normalizedLabel(rule);
    const campaign = liveByLabel.get(label);
    if (campaign) campaign.push(rule);
    else liveByLabel.set(label, [rule]);
    discountByRule.set(rule, discountPercent);
  }

  let best: Candidate | null = null;
  for (const [label, campaignRules] of liveByLabel) {
    const candidate: Candidate = {
      label,
      discountPercent: Math.max(...campaignRules.map((rule) => discountByRule.get(rule) ?? 0)),
      endsAt: campaignEndsAt(campaignRules),
      rules: campaignRules,
    };
    if (best === null || outranks(candidate, best)) best = candidate;
  }
  if (best === null) return null;
  const lastDay = best.endsAt === null ? null : lastBookingDay(best.endsAt, timezone);
  return {
    summary: {
      label: best.label,
      discountPercent: best.discountPercent,
      lastBookingDate: lastDay === null ? null : formatDateOnly(lastDay),
      daysLeft: lastDay === null ? null : daysUntil(now, lastDay, timezone),
      schedule: summarizeSaleSchedule(best.rules),
    },
    endsAt: best.endsAt,
  };
}

function normalizedLabel(rule: CampaignRuleView): string | null {
  return rule.campaignLabel?.trim() || null;
}

/**
 * A campaign remains live while any one of its currently-live sale rules is
 * live. An unbounded rule keeps the campaign unbounded; otherwise its deadline
 * is the latest rule end, not whichever individual rule had the deepest rate.
 */
function campaignEndsAt(rules: readonly CampaignRuleView[]): Date | null {
  let endsAt: Date | null = null;
  for (const rule of rules) {
    if (rule.saleEndsAt === null || rule.saleEndsAt === undefined) return null;
    if (endsAt === null || rule.saleEndsAt > endsAt) endsAt = rule.saleEndsAt;
  }
  return endsAt;
}

const UNLIMITED: Omit<SaleSchedule, 'varies'> = {
  weekdays: [],
  timeFrom: null,
  timeTo: null,
  dateFrom: null,
  dateTo: null,
};

/**
 * What the campaign's rules say about when it applies.
 *
 * Mixed rule types mean the campaign has no single shape to state, so it reports
 * `varies` rather than describing whichever type happens to come first.
 */
function summarizeSaleSchedule(group: readonly CampaignRuleView[]): SaleSchedule | null {
  const first = group[0];
  if (!first) return null;
  const types = new Set(group.map((rule) => rule.ruleType));
  if (types.size > 1) return { ...UNLIMITED, varies: true };

  switch (first.ruleType) {
    case 'day_of_week':
      return { ...UNLIMITED, weekdays: unionWeekdays(group), varies: false };

    case 'time_range': {
      // `days` absent means all seven (the entity drops an all-seven list), so a
      // union across rules would understate a campaign that runs every day.
      const everyDay = group.some((rule) => !Array.isArray(rule.params.days));
      const band = sharedBand(group, (rule) => [rule.params.from, rule.params.to]);
      if (band === null) return { ...UNLIMITED, varies: true };
      return {
        ...UNLIMITED,
        weekdays: everyDay ? [] : unionWeekdays(group),
        timeFrom: band[0],
        timeTo: band[1],
        varies: false,
      };
    }

    case 'date_range': {
      const span = contiguousDateSpan(group, (rule) => [rule.params.from, rule.params.to]);
      if (span === null) return { ...UNLIMITED, varies: true };
      return { ...UNLIMITED, dateFrom: span[0], dateTo: span[1], varies: false };
    }

    case 'date_time_range': {
      const span = contiguousDateSpan(group, (rule) => [rule.params.date, rule.params.date]);
      const band = sharedBand(group, (rule) => [rule.params.from, rule.params.to]);
      if (span === null || band === null) return { ...UNLIMITED, varies: true };
      return {
        ...UNLIMITED,
        dateFrom: span[0],
        dateTo: span[1],
        timeFrom: band[0],
        timeTo: band[1],
        varies: false,
      };
    }
  }
}

function unionWeekdays(group: readonly CampaignRuleView[]): number[] {
  const days = new Set<number>();
  for (const rule of group) {
    if (!Array.isArray(rule.params.days)) continue;
    for (const day of rule.params.days) {
      if (typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6) days.add(day);
    }
  }
  return [...days].sort((left, right) => left - right);
}

/** The clock band every rule shares, or null when they disagree or are malformed. */
function sharedBand(
  group: readonly CampaignRuleView[],
  read: (rule: CampaignRuleView) => [unknown, unknown],
): [string, string] | null {
  let band: [string, string] | null = null;
  for (const rule of group) {
    const [from, to] = read(rule);
    if (typeof from !== 'string' || typeof to !== 'string') return null;
    if (band === null) band = [from, to];
    else if (band[0] !== from || band[1] !== to) return null;
  }
  return band;
}

/**
 * One honest calendar span for the group's inclusive date rules, or null when
 * they are malformed or have a gap. Adjacent/overlapping rules are safe to
 * merge; Aug 1–2 plus Aug 8–9 must instead render as a varying schedule.
 */
function contiguousDateSpan(
  group: readonly CampaignRuleView[],
  read: (rule: CampaignRuleView) => [unknown, unknown],
): [string, string] | null {
  const ranges: Array<{ from: string; to: string; fromMs: number; toMs: number }> = [];
  for (const rule of group) {
    const [from, to] = read(rule);
    if (typeof from !== 'string' || typeof to !== 'string') return null;
    const fromMs = dateOnlyMs(from);
    const toMs = dateOnlyMs(to);
    if (fromMs === null || toMs === null || toMs < fromMs) return null;
    ranges.push({ from, to, fromMs, toMs });
  }
  const [first, ...rest] = ranges.sort((left, right) => left.fromMs - right.fromMs);
  if (!first) return null;
  let latest = first;
  for (const range of rest) {
    if (range.fromMs > latest.toMs + 86_400_000) return null;
    if (range.toMs > latest.toMs) latest = range;
  }
  return [first.from, latest.to];
}

function dateOnlyMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

/** Deeper discount wins; then a named campaign; then the one expiring sooner. */
function outranks(candidate: Candidate, best: Candidate): boolean {
  if (candidate.discountPercent !== best.discountPercent)
    return candidate.discountPercent > best.discountPercent;
  if ((candidate.label !== null) !== (best.label !== null)) return candidate.label !== null;
  if (candidate.endsAt === null || best.endsAt === null) return best.endsAt === null;
  return candidate.endsAt < best.endsAt;
}

/** Integer percent off, or null when the "sale" is not below the regular price. */
export function saleDiscountPercent(price: string, salePrice: string): number | null {
  const regular = BigInt(price);
  const sale = BigInt(salePrice);
  if (regular <= 0n || sale >= regular) return null;
  // Half-up on bigint: add half the divisor before dividing.
  return Math.max(1, Number(((regular - sale) * 100n + regular / 2n) / regular));
}

type CalendarDay = { year: number; month: number; day: number };

/**
 * The last day a booking still lands inside the window. `endsAt` is exclusive,
 * so a campaign ending at midnight is last bookable on the previous day — hence
 * stepping back one millisecond before reading the wall clock.
 */
function lastBookingDay(endsAt: Date, timezone: string): CalendarDay {
  return wallClockInZone(new Date(endsAt.getTime() - 1), timezone);
}

function daysUntil(now: Date, lastDay: CalendarDay, timezone: string): number {
  const today = wallClockInZone(now, timezone);
  const diff =
    Date.UTC(lastDay.year, lastDay.month - 1, lastDay.day) -
    Date.UTC(today.year, today.month - 1, today.day);
  return Math.max(0, Math.round(diff / 86_400_000));
}

function formatDateOnly({ year, month, day }: CalendarDay): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}
