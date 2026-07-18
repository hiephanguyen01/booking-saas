import type { BookingMode, ModeConfig, QuoteResponse } from '@booking/contracts';
import { percentOfBps, vnd, type Vnd } from '../../../../shared/money/money';
import { wallClockInZone } from '../../../../shared/time/time';

/**
 * Pure price calculator (TONG-QUAN.md §7.3/§9). No NestJS, no I/O — reused by the
 * public quote endpoint and Task 1.7 (bookings). All money is `bigint` VND.
 *
 * Rules (§9.1): a duration matching a mode_config block → the block (bundle)
 * price, flat, NEVER overridden by a rule. Otherwise per-unit (hour/night) base
 * price, with the highest-priority matching pricing_rule replacing the base for
 * that unit — so a golden-hour window prices only the hours inside it.
 */
export type RuleType = 'day_of_week' | 'time_range' | 'date_range' | 'date_time_range';

export interface PricingRuleView {
  id: string;
  bookingMode: BookingMode;
  ruleType: RuleType;
  params: Record<string, unknown>;
  /** VND đồng digit string — replaces the per-unit base when matched. */
  price: string;
  /** Optional effective sale price; regular `price` remains visible in the quote. */
  salePrice?: string | null;
  priority: number;
}

export interface QuoteLine {
  label: string;
  quantity: number;
  unitPrice: Vnd;
  regularUnitPrice: Vnd;
  amount: Vnd;
  regularAmount: Vnd;
  appliedRuleId?: string;
  block?: boolean;
}

export interface QuoteResult {
  mode: BookingMode;
  subtotal: Vnd;
  regularSubtotal: Vnd;
  depositAmount: Vnd;
  securityDeposit: Vnd;
  lineItems: QuoteLine[];
}

export interface QuoteRequest {
  mode: BookingMode;
  modeConfig: ModeConfig;
  pricingRules: PricingRuleView[];
  timezone: string;
  startUtc: Date;
  endUtc: Date;
  quantity: number;
  depositPercent: number;
}

/** Input shape of {@link computeQuoteResponse} (the former quote-service input). */
export type QuoteInput = QuoteRequest;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export class PricingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');

function ruleMatches(rule: PricingRuleView, wall: ReturnType<typeof wallClockInZone>): boolean {
  const p = rule.params;
  if (rule.ruleType === 'day_of_week') {
    const days = p.days;
    return Array.isArray(days) && days.includes(wall.weekday);
  }
  if (rule.ruleType === 'time_range') {
    const days = p.days;
    if (Array.isArray(days) && !days.includes(wall.weekday)) return false;
    const [fromH = 0, fromM = 0] = String(p.from).split(':').map(Number);
    const [toH = 0, toM = 0] = String(p.to).split(':').map(Number);
    const minutes = wall.hour * 60 + wall.minute;
    return minutes >= fromH * 60 + fromM && minutes < toH * 60 + toM;
  }
  const date = `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
  if (rule.ruleType === 'date_time_range') {
    if (date !== String(p.date)) return false;
    const [fromH = 0, fromM = 0] = String(p.from).split(':').map(Number);
    const [toH = 0, toM = 0] = String(p.to).split(':').map(Number);
    const minutes = wall.hour * 60 + wall.minute;
    return minutes >= fromH * 60 + fromM && minutes < toH * 60 + toM;
  }
  // date_range
  return date >= String(p.from) && date <= String(p.to);
}

/** Highest-priority rule matching a unit's wall clock (rules pre-sorted desc). */
function matchingRule(
  rules: PricingRuleView[],
  unitStart: Date,
  timezone: string,
): PricingRuleView | undefined {
  const wall = wallClockInZone(unitStart, timezone);
  return rules.find((r) => ruleMatches(r, wall));
}

/** Merge consecutive units with the same price + rule into one line item. */
function coalesce(
  units: { price: Vnd; regularPrice: Vnd; ruleId?: string }[],
  label: string,
): QuoteLine[] {
  const lines: QuoteLine[] = [];
  for (const unit of units) {
    const last = lines[lines.length - 1];
    if (
      last &&
      last.unitPrice === unit.price &&
      last.regularUnitPrice === unit.regularPrice &&
      last.appliedRuleId === unit.ruleId
    ) {
      last.quantity += 1;
      last.amount = last.unitPrice * BigInt(last.quantity);
      last.regularAmount = last.regularUnitPrice * BigInt(last.quantity);
    } else {
      lines.push({
        label,
        quantity: 1,
        unitPrice: unit.price,
        regularUnitPrice: unit.regularPrice,
        amount: unit.price,
        regularAmount: unit.regularPrice,
        ...(unit.ruleId ? { appliedRuleId: unit.ruleId } : {}),
      });
    }
  }
  return lines;
}

function wholeUnits(startUtc: Date, endUtc: Date, unitMs: number, unitName: string): number {
  const span = endUtc.getTime() - startUtc.getTime();
  if (span <= 0) throw new PricingError('INVALID_RANGE', 'End must be after start');
  // Charge whole STARTED units (a partial hour/night bills as a full one) — never
  // round a partial down and undercharge the reserved time.
  const units = Math.ceil(span / unitMs);
  if (units < 1) throw new PricingError('INVALID_RANGE', `Range is shorter than one ${unitName}`);
  return units;
}

function calendarDaysBetween(startUtc: Date, endUtc: Date, timezone: string): number {
  const start = wallClockInZone(startUtc, timezone);
  const end = wallClockInZone(endUtc, timezone);
  const count = Math.round(
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
      DAY_MS,
  );
  if (count < 1) throw new PricingError('INVALID_RANGE', 'Range is shorter than one night');
  return count;
}

export function computeQuote(req: QuoteRequest): QuoteResult {
  const rules = req.pricingRules
    .filter((r) => r.bookingMode === req.mode)
    .sort((a, b) => b.priority - a.priority);

  let subtotal: Vnd = 0n;
  let regularSubtotal: Vnd = 0n;
  let securityDeposit: Vnd = 0n;
  let lineItems: QuoteLine[];

  if (req.mode === 'hourly' || req.mode === 'daily') {
    const isHourly = req.mode === 'hourly';
    const hourly = req.modeConfig.hourly;
    const daily = req.modeConfig.daily;
    if (isHourly && !hourly)
      throw new PricingError('MODE_CONFIG_MISSING', 'No hourly config on this listing');
    if (!isHourly && !daily)
      throw new PricingError('MODE_CONFIG_MISSING', 'No daily config on this listing');

    const unitMs = isHourly ? HOUR_MS : DAY_MS;
    const count = isHourly
      ? wholeUnits(req.startUtc, req.endUtc, unitMs, 'hour')
      : calendarDaysBetween(req.startUtc, req.endUtc, req.timezone);
    const basePrice = isHourly ? vnd(hourly!.basePrice) : vnd(daily!.basePricePerNight);
    // Normalize blocks to {count, price} so the hourly/daily union stays clean.
    const blocks = isHourly
      ? hourly!.blocks.map((b) => ({ count: b.hours, price: b.price }))
      : daily!.blocks.map((b) => ({ count: b.days, price: b.price }));

    const pricedUnits = Array.from({ length: count }, (_, i) => {
      const unitStart = new Date(req.startUtc.getTime() + i * unitMs);
      const rule = matchingRule(rules, unitStart, req.timezone);
      const regularPrice = rule ? vnd(rule.price) : basePrice;
      return {
        price: rule?.salePrice ? vnd(rule.salePrice) : regularPrice,
        regularPrice,
        ruleId: rule?.id,
        calendarOverride: rule?.ruleType === 'date_range' || rule?.ruleType === 'date_time_range',
      };
    });

    const block = blocks.find((b) => b.count === count);
    // A partner's exact calendar price must not be hidden by an old duration
    // bundle. Recurring weekday/time rules retain the documented bundle behavior.
    if (block && !pricedUnits.some((unit) => unit.calendarOverride)) {
      // Bundle price — flat, not rule-overridable.
      const price = vnd(block.price);
      subtotal = price;
      lineItems = [
        {
          label: `${count} ${isHourly ? 'giờ' : 'đêm'} (bundle)`,
          quantity: 1,
          unitPrice: price,
          regularUnitPrice: price,
          amount: price,
          regularAmount: price,
          block: true,
        },
      ];
    } else {
      lineItems = coalesce(pricedUnits, isHourly ? 'Giờ' : 'Đêm');
      subtotal = lineItems.reduce((sum, l) => sum + l.amount, 0n);
    }
    regularSubtotal = lineItems.reduce((sum, l) => sum + l.regularAmount, 0n);
  } else if (req.mode === 'inventory') {
    const cfg = req.modeConfig.inventory;
    if (!cfg) throw new PricingError('MODE_CONFIG_MISSING', 'No inventory config on this listing');
    const unitMs = cfg.unit === 'hour' ? HOUR_MS : DAY_MS;
    const duration = wholeUnits(req.startUtc, req.endUtc, unitMs, cfg.unit);
    const basePrice = vnd(cfg.basePrice);
    // Per time-unit price with the highest-priority matching pricing_rule
    // replacing the per-unit base (§7.3 line 466) — inventory participates in
    // rule pricing exactly like hourly/daily (it has no bundle blocks to shield).
    const units = Array.from({ length: duration }, (_, i) => {
      const unitStart = new Date(req.startUtc.getTime() + i * unitMs);
      const rule = matchingRule(rules, unitStart, req.timezone);
      const regularPrice = rule ? vnd(rule.price) : basePrice;
      return {
        price: rule?.salePrice ? vnd(rule.salePrice) : regularPrice,
        regularPrice,
        ruleId: rule?.id,
      };
    });
    // Price one item across the range, then scale each line by the quantity rented.
    lineItems = coalesce(units, cfg.unit === 'hour' ? 'Giờ' : 'Ngày').map((line) => {
      const quantity = line.quantity * req.quantity;
      return {
        ...line,
        quantity,
        amount: line.unitPrice * BigInt(quantity),
        regularAmount: line.regularUnitPrice * BigInt(quantity),
      };
    });
    subtotal = lineItems.reduce((sum, l) => sum + l.amount, 0n);
    regularSubtotal = lineItems.reduce((sum, l) => sum + l.regularAmount, 0n);
    securityDeposit = vnd(cfg.securityDeposit) * BigInt(req.quantity);
  } else {
    throw new PricingError(
      'MODE_UNSUPPORTED',
      `Pricing for "${req.mode}" is not supported in Phase 1`,
    );
  }

  const depositAmount = percentOfBps(subtotal, req.depositPercent * 100);
  return { mode: req.mode, subtotal, regularSubtotal, depositAmount, securityDeposit, lineItems };
}

/**
 * {@link computeQuote} mapped to the `QuoteResponse` transport shape (VND
 * bigints → digit strings). Pure; throws {@link PricingError} on invalid input
 * — HTTP callers go through `application/pricing.ts#priceQuote`, which maps
 * pricing errors to 400s.
 */
export function computeQuoteResponse(input: QuoteInput): QuoteResponse {
  const result = computeQuote(input);
  return {
    currency: 'VND',
    mode: result.mode,
    subtotal: result.subtotal.toString(),
    regularSubtotal: result.regularSubtotal.toString(),
    savingsAmount: (result.regularSubtotal - result.subtotal).toString(),
    depositAmount: result.depositAmount.toString(),
    securityDeposit: result.securityDeposit.toString(),
    lineItems: result.lineItems.map((l) => ({
      label: l.label,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toString(),
      regularUnitPrice: l.regularUnitPrice.toString(),
      amount: l.amount.toString(),
      regularAmount: l.regularAmount.toString(),
      ...(l.appliedRuleId ? { appliedRuleId: l.appliedRuleId } : {}),
      ...(l.block ? { block: true } : {}),
    })),
  };
}
