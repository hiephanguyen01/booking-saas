import { Inject, Injectable } from '@nestjs/common';
import type { PricingRuleInput } from '@booking/contracts';
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
import {
  PricingRule,
  findOverlappingWindow,
  sameWindowKey,
} from '../../domain/entities/pricing-rule.entity';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import {
  PricingRuleOverlap,
  PricingWindowOutsideOpenHours,
} from '../../domain/errors/pricing-rule-errors';

@Injectable()
export class CreatePartnerPricingRuleUseCase {
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
    input: PricingRuleInput,
  ): Promise<PricingRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) throw new ListingNotFound();
      if (listing.partnerId !== partnerId) {
        throw new ListingNotOwned();
      }
      const candidate = PricingRule.open({
        listingId,
        bookingMode: input.bookingMode,
        ruleType: input.ruleType,
        params: input.params,
        price: input.price,
        salePrice: input.salePrice ?? null,
        priority: input.priority,
      });
      PricingRule.of(candidate).assertAllowedOn({
        bookingModes: listing.bookingModes,
        bookingSelection: listing.bookingSelection,
      });
      // Calendar edits are save/replace operations. Remove the previous exact
      // override for the same mode and scope so repeated saves stay deterministic.
      if (input.ruleType === 'date_range' || input.ruleType === 'date_time_range') {
        const existing = await this.rules.listByListing(tx, listingId);
        if (input.ruleType === 'date_time_range') {
          const overlap = findOverlappingWindow(existing, candidate);
          if (overlap) {
            throw new PricingRuleOverlap(String(overlap.params.from), String(overlap.params.to));
          }
          await this.assertInsideOpenHours(tx, listingId, listing.resourceId, candidate.params);
        }
        for (const rule of existing) {
          if (sameWindowKey(rule, candidate)) await this.rules.delete(tx, rule.id);
        }
      }
      const created = await this.rules.create(tx, tenantId, candidate);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'pricing_rule.created',
        payload: { pricingRuleId: created.id, listingId },
      });
      return created;
    });
  }

  /**
   * A `date_time_range` window must fall inside the date's opening hours.
   * Enforced here rather than in the dashboard so it holds for every partner —
   * the dashboard could only check it for partners who also hold
   * `partner.availability.manage`, since reading the hours needs that scope.
   */
  private async assertInsideOpenHours(
    tx: PrismaTx,
    listingId: string,
    resourceId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const { rules, exception } = await this.openHours.forDate(
      tx,
      listingId,
      resourceId,
      String(params.date),
    );
    const windows = localOpenWindowsForDate(String(params.date), rules, exception);
    if (!windowFitsOpenHours(windows, String(params.from), String(params.to))) {
      throw new PricingWindowOutsideOpenHours(windows);
    }
  }
}
