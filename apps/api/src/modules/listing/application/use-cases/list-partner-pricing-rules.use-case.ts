import { Inject, Injectable } from '@nestjs/common';
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

  execute(tenantId: string, partnerId: string, listingId: string): Promise<PricingRuleRecord[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) throw new LegacyListingNotFound();
      if (listing.partnerId !== partnerId) {
        throw new LegacyListingNotOwned();
      }
      return this.rules.listByListing(tx, listingId);
    });
  }
}
