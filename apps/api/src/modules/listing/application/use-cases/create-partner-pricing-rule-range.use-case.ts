import { Inject, Injectable } from '@nestjs/common';
import type { PricingRuleRangeInput, PricingRuleSkipReason } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
  type PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import {
  OPEN_HOURS_READER,
  type IOpenHoursReader,
} from '../../domain/ports/open-hours-reader.port';
import {
  localOpenWindowsForDate,
  windowFitsOpenHours,
} from '../../../../shared/domain/availability/open-windows';
import { eachDate } from '../../../../shared/domain/availability/date-util';
import {
  PricingRule,
  findOverlappingWindow,
  sameWindowKey,
  type NewPricingRule,
} from '../../domain/entities/pricing-rule.entity';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';

export interface PricingRuleRangeResult {
  created: PricingRuleRecord[];
  skipped: { date: string; reason: PricingRuleSkipReason }[];
}

/**
 * Apply one price across a span of dates in a single transaction — the
 * calendar's range action (§7.3).
 *
 * Two deliberate differences from the single-date use case:
 *
 * 1. **`daily` collapses to one row.** The quote calculator matches a date
 *    against a `date_range`'s `[from, to]`, so a 30-night span is ONE rule, not
 *    30. `hourly` cannot collapse — its rule carries a single date's clock
 *    window — so it expands to a row per date.
 * 2. **Unsellable dates are skipped, not fatal.** A real span nearly always
 *    covers days the listing is closed; failing all 30 days because day 12 is
 *    shut would make the feature useless. Per-date rejections come back as
 *    `skipped` with a reason and the caller reports "applied to 22 of 30".
 *    Ownership/mode/package errors still throw — those condemn the whole span.
 */
@Injectable()
export class CreatePartnerPricingRuleRangeUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    @Inject(OPEN_HOURS_READER) private readonly openHours: IOpenHoursReader,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    listingId: string,
    input: PricingRuleRangeInput,
  ): Promise<PricingRuleRangeResult> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) throw new ListingNotFound();
      if (listing.partnerId !== partnerId) {
        throw new ListingNotOwned();
      }

      const isDaily = input.bookingMode === 'daily';
      const window = input.window;
      const candidateFor = (params: Record<string, unknown>): NewPricingRule =>
        PricingRule.open({
          listingId,
          bookingMode: input.bookingMode,
          ruleType: isDaily ? 'date_range' : 'date_time_range',
          params,
          price: input.price,
          salePrice: input.salePrice ?? null,
          priority: input.priority,
        });
      const spanParams = isDaily
        ? { from: input.dateFrom, to: input.dateTo }
        : { date: input.dateFrom, from: window!.from, to: window!.to };
      // Gate the whole span on mode/selection before touching any date, so an
      // ineligible listing fails outright instead of reporting 30 skips.
      PricingRule.of(candidateFor(spanParams)).assertAllowedOn({
        bookingModes: listing.bookingModes,
        bookingSelection: listing.bookingSelection,
      });

      const created: PricingRuleRecord[] = [];
      const skipped: { date: string; reason: PricingRuleSkipReason }[] = [];
      // One read for the whole span. Rows this transaction deletes need no
      // pruning from it: an overlap requires the same `params.date`, and each
      // date is visited once, so a row replaced on date D can never reach the
      // check for a later date.
      const existing = await this.rules.listByListing(tx, listingId);

      if (isDaily) {
        const candidate = candidateFor(spanParams);
        await this.replaceSameWindow(tx, existing, candidate);
        created.push(await this.rules.create(tx, tenantId, candidate));
      } else {
        for (const date of eachDate(input.dateFrom, input.dateTo)) {
          const candidate = candidateFor({ date, from: window!.from, to: window!.to });

          const { rules: weekly, exception } = await this.openHours.forDate(
            tx,
            listingId,
            listing.resourceId,
            date,
          );
          const openWindows = localOpenWindowsForDate(date, weekly, exception);
          if (openWindows.length === 0) {
            skipped.push({ date, reason: 'closed' });
            continue;
          }
          if (!windowFitsOpenHours(openWindows, window!.from, window!.to)) {
            skipped.push({ date, reason: 'outside_open_hours' });
            continue;
          }
          if (findOverlappingWindow([...existing, ...created], candidate)) {
            skipped.push({ date, reason: 'overlap' });
            continue;
          }

          await this.replaceSameWindow(tx, existing, candidate);
          created.push(await this.rules.create(tx, tenantId, candidate));
        }
      }

      if (created.length > 0) {
        // One event for the whole span, not one per row: the scheduling handler
        // invalidates by listing, so N events would do the same work N times.
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'pricing_rule.bulk_created',
          payload: { listingId, count: created.length },
        });
      }
      return { created, skipped };
    });
  }

  /**
   * Re-saving the exact same scope overwrites it, matching the single-date
   * save — `findOverlappingWindow` deliberately does not flag an identical
   * window, so this is what stops a repeated range action stacking duplicates.
   */
  private async replaceSameWindow(
    tx: PrismaTx,
    existing: readonly PricingRuleRecord[],
    candidate: NewPricingRule,
  ): Promise<void> {
    for (const rule of existing) {
      if (sameWindowKey(rule, candidate)) await this.rules.delete(tx, rule.id);
    }
  }
}
