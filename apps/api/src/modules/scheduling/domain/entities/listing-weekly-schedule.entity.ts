import type { AvailabilityRuleInput } from '@booking/contracts';
import { InvalidAvailabilityRule } from '../errors/availability-errors';

/**
 * ListingWeeklySchedule aggregate (§7.4) — the whole weekly opening-hours rule
 * set of a single listing, treated as one atomic unit. The availability
 * write-path never edits a rule in place: it replaces the entire set at once
 * ({@link ListingWeeklySchedule.replaceWith}), matching how
 * `setAvailabilityRulesInputSchema` (`{ rules }`) and the repository's
 * delete-all-then-insert flow already behave.
 *
 * Owns the shape validation that mirrors zod `availabilityRuleInputSchema`
 * (field format + the `openTime < closeTime` refine) plus the `.max(50)` cap
 * on `setAvailabilityRulesInputSchema`, kept here as defensive depth: the zod
 * contracts (`contracts/availability.ts`) are the real HTTP boundary, so
 * {@link InvalidAvailabilityRule} is unreachable over the wire and only guards
 * against an invalid set constructed directly in-process.
 *
 * An EMPTY rule array is valid — it means "clear the whole schedule" (the
 * listing has no weekly opening hours), not an error.
 *
 * NOT owned here (deliberately, §8a known gap): NO overlap check between rules
 * on the same `dayOfWeek`. The pre-refactor write-path accepts two overlapping
 * windows on the same weekday, and tightening that would change behaviour —
 * this aggregate preserves the gap and never cross-checks rules against each
 * other, only each rule against its own invariants.
 *
 * Framework-free: no Nest, no Prisma, no zod. No clock, no bigint, no random.
 */

/** HH:MM 24-hour clock — byte-identical to `contracts/availability.ts`'s `timeStringSchema` regex. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ceiling on rules per set — mirrors `setAvailabilityRulesInputSchema.max(50)`. */
const MAX_RULES = 50;

export class ListingWeeklySchedule {
  private constructor(
    readonly listingId: string,
    readonly rules: readonly AvailabilityRuleInput[],
  ) {}

  /**
   * Validate + package a whole replacement rule set (atomic replace — never a
   * partial edit). Throws {@link InvalidAvailabilityRule} on the first offending
   * rule; an empty array passes (clears the schedule). Per-rule checks mirror
   * `availabilityRuleInputSchema`: `dayOfWeek` an integer 0..6, `openTime` /
   * `closeTime` matching {@link TIME_PATTERN}, and `openTime < closeTime` by
   * string comparison (the same lexical compare the schema's `.refine` uses).
   * Deliberately does NOT overlap-check same-weekday rules (§8a known gap).
   */
  static replaceWith(listingId: string, rules: readonly AvailabilityRuleInput[]): ListingWeeklySchedule {
    if (rules.length > MAX_RULES) {
      throw new InvalidAvailabilityRule(`at most ${MAX_RULES} rules allowed, got ${rules.length}`);
    }
    for (const rule of rules) {
      if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
        throw new InvalidAvailabilityRule(`dayOfWeek must be an integer 0..6, got ${String(rule.dayOfWeek)}`);
      }
      if (!TIME_PATTERN.test(rule.openTime)) {
        throw new InvalidAvailabilityRule(`openTime must be HH:MM (24h), got ${String(rule.openTime)}`);
      }
      if (!TIME_PATTERN.test(rule.closeTime)) {
        throw new InvalidAvailabilityRule(`closeTime must be HH:MM (24h), got ${String(rule.closeTime)}`);
      }
      if (!(rule.openTime < rule.closeTime)) {
        throw new InvalidAvailabilityRule('closeTime must be after openTime');
      }
    }
    return new ListingWeeklySchedule(listingId, rules);
  }
}
