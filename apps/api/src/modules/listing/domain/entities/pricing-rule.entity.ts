import type { BookingMode, BookingSelection } from '@booking/contracts';
import type { RuleType } from '../../../../shared/domain/pricing/quote-calculator';
import { ModeNotEnabled, PackagePricingFixed } from '../errors/pricing-rule-errors';

/**
 * PricingRule aggregate (§7.3) — a conditional price override for a listing:
 * a `bookingMode` + `ruleType` (day_of_week/time_range/date_range/
 * date_time_range) scoped by `params`, carrying a VND `price` and optional
 * `salePrice`, with a `priority` the quote calculator uses to pick among
 * matching rules.
 *
 * Owns the two-check gate duplicated verbatim across the tenant- and
 * partner-path create use-cases — mode-enabled first, then
 * not-fixed-packages ({@link PricingRule.assertAllowedOn}) — plus the pure,
 * partner-path-only helpers for the calendar-edit save/replace flow
 * ({@link findOverlappingWindow}, {@link sameWindowKey}).
 *
 * NOT owned here (deliberately): overlap detection and replace-on-save both
 * run ONLY on the partner path today (`create-partner-pricing-rule.use-case.ts`)
 * — the tenant path (`create-pricing-rule.use-case.ts`) has neither, a
 * preserved known gap (§8a). This aggregate exposes the pure predicates only;
 * the use-case decides when (and whether) to call them and throws
 * `PricingRuleOverlap` from the result. Money stays `string` here — `price`/
 * `salePrice` are handed through untouched; the repository does the
 * `BigInt()` parse, this aggregate does no arithmetic.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** Validated insert payload (id/tenantId/createdAt assigned by the DB). */
export interface NewPricingRule {
  listingId: string;
  bookingMode: BookingMode;
  ruleType: RuleType;
  params: Record<string, unknown>;
  /** VND đồng digit string — the repository does the `BigInt()` parse. */
  price: string;
  /** Optional partner-funded sale price; lower than `price`. */
  salePrice: string | null;
  priority: number;
}

/**
 * `params` in its one canonical form: `days` sorted, because it names a SET of
 * weekdays and `[6,0]` must not read as a different scope from `[0,6]`.
 */
function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const days = params.days;
  if (!Array.isArray(days)) return params;
  return { ...params, days: [...days].map(Number).sort((a, b) => a - b) };
}

/**
 * A scope's identity as a string, independent of key order.
 *
 * `params` is `jsonb`, and **Postgres normalises object key order on write** —
 * a stored window comes back as `{to, date, from}` while a candidate built here
 * is `{date, from, to}`. Comparing with plain `JSON.stringify` therefore said
 * "different scope" for two identical rules, which silently broke the
 * save/replace contract and let duplicate rows accumulate. Sorting the keys
 * before serialising is what makes the comparison mean what it claims.
 */
function canonicalParams(params: Record<string, unknown>): string {
  return JSON.stringify(params, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : value,
  );
}

export class PricingRule {
  private constructor(private readonly bookingMode: BookingMode) {}

  /**
   * Assemble a new rule, normalising `params` into the one canonical form a
   * scope has. No validation — call {@link PricingRule.of} +
   * {@link PricingRule.assertAllowedOn} against the target listing first.
   *
   * Normalising here rather than at each call site is what lets
   * {@link sameWindowKey} recognise "the same rule saved again": `days` is a SET
   * of weekdays, so `[6,0]` and `[0,6]` name one scope and must serialise
   * identically.
   */
  static open(input: {
    listingId: string;
    bookingMode: BookingMode;
    ruleType: RuleType;
    params: Record<string, unknown>;
    price: string;
    salePrice: string | null;
    priority: number;
  }): NewPricingRule {
    return {
      listingId: input.listingId,
      bookingMode: input.bookingMode,
      ruleType: input.ruleType,
      params: normalizeParams(input.params),
      price: input.price,
      salePrice: input.salePrice,
      priority: input.priority,
    };
  }

  /** Wrap a not-yet-created candidate so {@link assertAllowedOn} has the
   *  rule's own `bookingMode` to check. */
  static of(candidate: NewPricingRule): PricingRule {
    return new PricingRule(candidate.bookingMode);
  }

  /**
   * Mode-enabled check first, then not-fixed-packages — this order and both
   * conditions are copied verbatim from both create use-cases (identical in
   * each): a rule for a mode the listing hasn't turned on is refused before
   * a fixed-package listing (whose prices are wholly managed via its package
   * configuration) is refused outright.
   */
  assertAllowedOn(listing: { bookingModes: BookingMode[]; bookingSelection: BookingSelection }): void {
    if (!listing.bookingModes.includes(this.bookingMode)) {
      throw new ModeNotEnabled(this.bookingMode);
    }
    if (listing.bookingSelection === 'fixed_packages') {
      throw new PackagePricingFixed();
    }
  }
}

/**
 * Partner-path-only: does `candidate` (a rule about to be saved) overlap an
 * already-stored rule for the same `bookingMode`? Fires only when
 * `candidate.ruleType === 'date_time_range'` — `date_range` and every other
 * rule type never overlap-check. Excludes the candidate's own exact params
 * (a resave of the identical window) via canonical-params inequality, then
 * requires the same `params.date` and a half-open `[from, to)` string
 * interval overlap — copied verbatim from
 * `create-partner-pricing-rule.use-case.ts`. Returns the overlapping stored
 * rule, or `null` when there is none; the use-case throws
 * `PricingRuleOverlap(String(from), String(to))` from the result.
 */
export function findOverlappingWindow(
  existing: { bookingMode: BookingMode; ruleType: RuleType; params: Record<string, unknown> }[],
  candidate: { bookingMode: BookingMode; ruleType: RuleType; params: Record<string, unknown> },
): (typeof existing)[number] | null {
  if (candidate.ruleType !== 'date_time_range') return null;
  const paramsKey = canonicalParams(candidate.params);
  const date = String(candidate.params.date);
  const from = String(candidate.params.from);
  const to = String(candidate.params.to);
  const overlap = existing.find(
    (rule) =>
      rule.bookingMode === candidate.bookingMode &&
      rule.ruleType === 'date_time_range' &&
      String(rule.params.date) === date &&
      canonicalParams(rule.params) !== paramsKey &&
      from < String(rule.params.to) &&
      to > String(rule.params.from),
  );
  return overlap ?? null;
}

/** Weekdays a recurring rule covers. An absent `days` on `time_range` means all seven. */
function coveredDays(params: Record<string, unknown>): number[] {
  const days = params.days;
  return Array.isArray(days) && days.length > 0 ? days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Does `candidate` (a `day_of_week` / `time_range` rule about to be saved)
 * collide with an already-stored recurring rule?
 *
 * Two recurring rules that both match the same instant are not merely
 * redundant — which one applies is decided by `priority`, and recurring rules
 * all share one band, so a tie resolves by array order. That is not a price the
 * partner chose. Refusing the overlap keeps the answer deterministic.
 *
 * Collision means: same `bookingMode`, same rule type, at least one shared
 * weekday, and — for `time_range` only — half-open `[from, to)` clock overlap.
 * A `day_of_week` rule has no clock, so sharing a weekday is already a
 * collision. The candidate's own identical params are excluded so re-saving the
 * same rule reads as a replace, matching {@link findOverlappingWindow}.
 */
export function findOverlappingRecurring(
  existing: { bookingMode: BookingMode; ruleType: RuleType; params: Record<string, unknown> }[],
  candidate: { bookingMode: BookingMode; ruleType: RuleType; params: Record<string, unknown> },
): (typeof existing)[number] | null {
  if (candidate.ruleType !== 'day_of_week' && candidate.ruleType !== 'time_range') return null;
  const paramsKey = canonicalParams(candidate.params);
  const days = new Set(coveredDays(candidate.params));
  const from = String(candidate.params.from);
  const to = String(candidate.params.to);
  const overlap = existing.find((rule) => {
    if (rule.bookingMode !== candidate.bookingMode) return false;
    if (rule.ruleType !== candidate.ruleType) return false;
    if (canonicalParams(rule.params) === paramsKey) return false;
    if (!coveredDays(rule.params).some((day) => days.has(day))) return false;
    if (candidate.ruleType === 'day_of_week') return true;
    return from < String(rule.params.to) && to > String(rule.params.from);
  });
  return overlap ?? null;
}

/**
 * Partner-path-only replace-match predicate: does `a` occupy the exact same
 * scope as `b` (same `bookingMode` + `ruleType` + `params`)? The
 * calendar-edit save flow deletes every stored rule matching this before
 * inserting the new one, keeping repeated saves of the same window
 * idempotent — copied verbatim from `create-partner-pricing-rule.use-case.ts`.
 */
export function sameWindowKey(
  a: { bookingMode: BookingMode; ruleType: RuleType; params: Record<string, unknown> },
  b: { bookingMode: BookingMode; ruleType: RuleType; params: Record<string, unknown> },
): boolean {
  return (
    a.bookingMode === b.bookingMode &&
    a.ruleType === b.ruleType &&
    canonicalParams(a.params) === canonicalParams(b.params)
  );
}
