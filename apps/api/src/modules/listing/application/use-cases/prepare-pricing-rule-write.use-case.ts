import { Inject, Injectable } from '@nestjs/common';
import type { BookingMode, BookingSelection } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';
import {
  OPEN_HOURS_READER,
  type IOpenHoursReader,
} from '../../domain/ports/open-hours-reader.port';
import {
  localOpenWindowsForDate,
  windowFitsOpenHours,
} from '../../../../shared/domain/availability/open-windows';
import {
  findOverlappingRecurring,
  findOverlappingWindow,
  sameWindowKey,
  type NewPricingRule,
} from '../../domain/entities/pricing-rule.entity';
import {
  PricingRuleOverlap,
  PricingWindowOutsideOpenHours,
  RecurringPricingRuleOverlap,
} from '../../domain/errors/pricing-rule-errors';

/** The listing facts a pricing-rule write is judged against. */
export interface PricingRuleTarget {
  id: string;
  resourceId: string;
  bookingModes: BookingMode[];
  bookingSelection: BookingSelection;
}

/**
 * Everything that must be true (and cleared) before a pricing rule row is
 * inserted: no overlap with a stored rule, an hourly window inside the date's
 * opening hours, and the previous rule for the same scope removed so the save
 * reads as a replace.
 *
 * A use-case rather than a helper because it needs two ports, and shared rather
 * than copied because the partner and tenant create paths must not drift — the
 * tenant path used to have none of these checks at all, which is precisely how
 * they drifted the first time.
 *
 * Runs inside the caller's transaction: the checks and the insert have to
 * commit together, so it takes `tx` and never opens its own.
 */
@Injectable()
export class PreparePricingRuleWriteUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    @Inject(OPEN_HOURS_READER) private readonly openHours: IOpenHoursReader,
  ) {}

  async execute(
    tx: PrismaTx,
    listing: PricingRuleTarget,
    candidate: NewPricingRule,
  ): Promise<void> {
    const isDateScoped =
      candidate.ruleType === 'date_range' || candidate.ruleType === 'date_time_range';
    const isRecurring =
      candidate.ruleType === 'day_of_week' || candidate.ruleType === 'time_range';
    if (!isDateScoped && !isRecurring) return;

    const existing = await this.rules.listByListing(tx, listing.id);

    if (candidate.ruleType === 'date_time_range') {
      const overlap = findOverlappingWindow(existing, candidate);
      if (overlap) {
        throw new PricingRuleOverlap(String(overlap.params.from), String(overlap.params.to));
      }
      await this.assertInsideOpenHours(tx, listing, candidate.params);
    } else if (isRecurring) {
      // Recurring rules all share one priority band, so two that match the same
      // instant resolve by array order — refuse the collision instead of letting
      // an arbitrary one win.
      const overlap = findOverlappingRecurring(existing, candidate);
      if (overlap) {
        const days = Array.isArray(overlap.params.days) ? overlap.params.days.map(Number) : [];
        throw new RecurringPricingRuleOverlap(
          days,
          candidate.ruleType === 'time_range'
            ? { from: String(overlap.params.from), to: String(overlap.params.to) }
            : undefined,
        );
      }
    }

    // The overlap checks deliberately do NOT flag an identical scope, so this
    // replace is what stops a re-save becoming a duplicate row.
    for (const rule of existing) {
      if (sameWindowKey(rule, candidate)) await this.rules.delete(tx, rule.id);
    }
  }

  /**
   * An hourly window must fall inside the date's opening hours. Enforced here
   * rather than in a dashboard so it holds for every caller — a dashboard could
   * only check it for users who also hold the availability-read scope.
   */
  private async assertInsideOpenHours(
    tx: PrismaTx,
    listing: PricingRuleTarget,
    params: Record<string, unknown>,
  ): Promise<void> {
    const { rules, exception } = await this.openHours.forDate(
      tx,
      listing.id,
      listing.resourceId,
      String(params.date),
    );
    const windows = localOpenWindowsForDate(String(params.date), rules, exception);
    if (!windowFitsOpenHours(windows, String(params.from), String(params.to))) {
      throw new PricingWindowOutsideOpenHours(windows);
    }
  }
}
