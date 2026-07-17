import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
      if (!listing)
        throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
      if (listing.partnerId !== partnerId) {
        throw new ForbiddenException({
          code: 'LISTING_NOT_OWNED',
          message: 'This listing belongs to another partner',
        });
      }
      return this.rules.listByListing(tx, listingId);
    });
  }
}
