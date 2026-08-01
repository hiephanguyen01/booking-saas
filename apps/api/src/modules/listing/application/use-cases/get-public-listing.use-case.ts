import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  summarizeSaleCampaign,
  type SaleCampaignSummary,
} from '../../../../shared/domain/pricing/sale-campaign';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type PublicListingRecord,
} from '../../domain/ports/listing-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';
import { ListingNotFound } from '../../domain/errors/listing-errors';

export interface PublicListingDetail {
  listing: PublicListingRecord;
  /** Sale campaign running right now across the listing's pricing rules. */
  campaign: SaleCampaignSummary | null;
}

/** Storefront listing detail, resolved from the Host. Published listings only. */
@Injectable()
export class GetPublicListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly pricingRules: IPricingRuleRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string): Promise<PublicListingDetail> {
    const tenant = await this.resolveTenant.execute(host);
    // This is the only clock used by this projection, including its campaign
    // deadline/countdown. It must not drift while the database read runs.
    const now = utcNow();
    const found = await this.tenantDb.forTenant(tenant.id, async (tx) => {
      const listing = await this.listings.findPublicBySlug(tx, slug);
      if (!listing) return null;
      const rules = await this.pricingRules.listByListing(tx, listing.id);
      return {
        listing,
        campaign: summarizeSaleCampaign(rules, now, listing.resourceTimezone),
      };
    });
    if (!found) {
      throw new ListingNotFound();
    }
    // No mode filter: the page has not asked the visitor to pick one yet, so the
    // badge speaks for the listing as a whole.
    return {
      listing: found.listing,
      campaign: found.campaign,
    };
  }
}
