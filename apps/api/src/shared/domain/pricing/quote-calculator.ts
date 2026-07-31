import type {
  BookingMode,
  BookingSelection,
  ModeConfig,
  QuoteResponse,
  SelectedPackage,
} from '@booking/contracts';
import { percentOfBps, vnd, type Vnd } from '../../money/money';
import { wallClockInZone } from '../../time/time';
import { findActivePackage, ListingModeConfigError } from './package-config';

/**
 * Pure price calculator (TONG-QUAN.md §7.3/§9). No NestJS, no I/O — reused by the
 * public quote endpoint and Task 1.7 (bookings). All money is `bigint` VND.
 *
 * Flexible pricing uses a per-unit base with the highest-priority matching rule.
 * Fixed-package pricing uses the package's absolute price and ignores rules.
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
  /**
   * Campaign window for `salePrice` only, half-open `[start, end)`, compared
   * against booking time. Null on a side = unbounded there.
   */
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
  /** Display-only campaign name, surfaced on the quote line that used the sale. */
  campaignLabel?: string | null;
  priority: number;
}

/**
 * The sale price to charge right now, or null when there is none in force.
 *
 * A campaign bounds the SALE, not the rule: once it ends the rule keeps applying
 * its regular `price`. Dropping the rule entirely instead would send the price
 * back to the listing's base, which a partner cannot tell apart from someone
 * having deleted their rule.
 */
export function activeSalePrice(rule: PricingRuleView, now: Date): string | null {
  if (!rule.salePrice) return null;
  if (rule.saleStartsAt && now < rule.saleStartsAt) return null;
  if (rule.saleEndsAt && now >= rule.saleEndsAt) return null;
  return rule.salePrice;
}

export interface QuoteLine {
  label: string;
  quantity: number;
  unitPrice: Vnd;
  regularUnitPrice: Vnd;
  amount: Vnd;
  regularAmount: Vnd;
  appliedRuleId?: string;
  /** Set only when this line is discounted by a named campaign. */
  campaignLabel?: string;
  block?: boolean;
}

export interface QuoteResult {
  mode: BookingMode;
  subtotal: Vnd;
  regularSubtotal: Vnd;
  depositAmount: Vnd;
  securityDeposit: Vnd;
  lineItems: QuoteLine[];
  selectedPackage?: SelectedPackage;
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
  bookingSelection: BookingSelection;
  packageId?: string;
  /**
   * Booking-time instant a sale campaign is judged against. Required on purpose:
   * defaulting it here would let a call site silently price against the wrong
   * clock, and this is the only path that turns rules into money.
   */
  now: Date;
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
  units: { price: Vnd; regularPrice: Vnd; ruleId?: string; campaignLabel?: string }[],
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
        ...(unit.campaignLabel ? { campaignLabel: unit.campaignLabel } : {}),
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
  let selectedPackage: SelectedPackage | undefined;

  if (req.bookingSelection === 'fixed_packages') {
    try {
      selectedPackage = findActivePackage(req.modeConfig, req.mode, req.packageId);
    } catch (error) {
      if (error instanceof ListingModeConfigError) {
        throw new PricingError(error.code, error.message);
      }
      throw error;
    }
    const durationMatches =
      selectedPackage.mode === 'hourly'
        ? req.endUtc.getTime() - req.startUtc.getTime() === selectedPackage.durationMinutes * 60_000
        : calendarDaysBetween(req.startUtc, req.endUtc, req.timezone) ===
          selectedPackage.durationDays;
    if (!durationMatches) {
      throw new PricingError(
        'PACKAGE_DURATION_MISMATCH',
        'The requested time range does not match the selected package',
      );
    }
    const price = vnd(selectedPackage.price);
    subtotal = price;
    regularSubtotal = price;
    lineItems = [
      {
        label: selectedPackage.name,
        quantity: 1,
        unitPrice: price,
        regularUnitPrice: price,
        amount: price,
        regularAmount: price,
      },
    ];
  } else if (req.mode === 'hourly' || req.mode === 'daily') {
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
    const rawBasePrice = isHourly ? hourly!.basePrice : daily!.basePricePerNight;
    if (!rawBasePrice) {
      throw new PricingError('MODE_CONFIG_MISSING', 'No flexible base price on this listing');
    }
    const basePrice = vnd(rawBasePrice);

    const pricedUnits = Array.from({ length: count }, (_, i) => {
      const unitStart = new Date(req.startUtc.getTime() + i * unitMs);
      const rule = matchingRule(rules, unitStart, req.timezone);
      const regularPrice = rule ? vnd(rule.price) : basePrice;
      const sale = rule ? activeSalePrice(rule, req.now) : null;
      return {
        price: sale ? vnd(sale) : regularPrice,
        regularPrice,
        ruleId: rule?.id,
        ...(sale && rule?.campaignLabel ? { campaignLabel: rule.campaignLabel } : {}),
        calendarOverride: rule?.ruleType === 'date_range' || rule?.ruleType === 'date_time_range',
      };
    });

    lineItems = coalesce(pricedUnits, isHourly ? 'Giờ' : 'Đêm');
    subtotal = lineItems.reduce((sum, l) => sum + l.amount, 0n);
    regularSubtotal = lineItems.reduce((sum, l) => sum + l.regularAmount, 0n);
  } else if (req.mode === 'inventory') {
    const cfg = req.modeConfig.inventory;
    if (!cfg) throw new PricingError('MODE_CONFIG_MISSING', 'No inventory config on this listing');
    const unitMs = cfg.unit === 'hour' ? HOUR_MS : DAY_MS;
    const duration = wholeUnits(req.startUtc, req.endUtc, unitMs, cfg.unit);
    const basePrice = vnd(cfg.basePrice);
    // Per time-unit price with the highest-priority matching pricing_rule
    // replacing the per-unit base (§7.3 line 466) — inventory participates in
    // rule pricing exactly like flexible hourly/daily pricing.
    const units = Array.from({ length: duration }, (_, i) => {
      const unitStart = new Date(req.startUtc.getTime() + i * unitMs);
      const rule = matchingRule(rules, unitStart, req.timezone);
      const regularPrice = rule ? vnd(rule.price) : basePrice;
      const sale = rule ? activeSalePrice(rule, req.now) : null;
      return {
        price: sale ? vnd(sale) : regularPrice,
        regularPrice,
        ruleId: rule?.id,
        ...(sale && rule?.campaignLabel ? { campaignLabel: rule.campaignLabel } : {}),
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
  return {
    mode: req.mode,
    subtotal,
    regularSubtotal,
    depositAmount,
    securityDeposit,
    lineItems,
    ...(selectedPackage ? { selectedPackage } : {}),
  };
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
      ...(l.campaignLabel ? { campaignLabel: l.campaignLabel } : {}),
      ...(l.block ? { block: true } : {}),
    })),
    ...(result.selectedPackage ? { selectedPackage: result.selectedPackage } : {}),
  };
}
