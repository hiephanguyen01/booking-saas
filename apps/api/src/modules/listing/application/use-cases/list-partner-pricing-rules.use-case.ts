import { Inject, Injectable } from '@nestjs/common';
import type { CalendarRangeQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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
  LegacyListingNotFound,
  LegacyListingNotOwned,
} from '../listing-legacy-http-errors';

@Injectable()
export class ListPartnerPricingRulesUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  /** `range` narrows date-scoped rules to a calendar window; recurring rules always come back. */
  execute(
    tenantId: string,
    partnerId: string,
    listingId: string,
    range?: CalendarRangeQuery,
  ): Promise<PricingRuleRecord[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) throw new LegacyListingNotFound();
      if (listing.partnerId !== partnerId) {
        throw new LegacyListingNotOwned();
      }
      const window =
        range?.from && range.to ? { from: range.from, to: range.to } : undefined;
      return this.rules.listByListing(tx, listingId, window);
    });
  }
}
