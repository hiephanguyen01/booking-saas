import { Inject, Injectable } from '@nestjs/common';
import type { PublicListingGroupDetailResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../../catalog/domain/ports/listing-type-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';
import { utcNow } from '../../../../shared/time/time';
import {
  summarizeSaleCampaign,
  type CampaignRuleView,
  type SaleCampaignSummary,
} from '../../../../shared/domain/pricing/sale-campaign';
import { toPublicListingGroupDetailResponse } from '../listing.mapper';

@Injectable()
export class GetPublicListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly pricingRules: IPricingRuleRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string): Promise<PublicListingGroupDetailResponse> {
    const tenant = await this.resolveTenant.execute(host);
    // Every room's campaign uses this same instant. Its date/countdown is then
    // resolved in the individual room resource's timezone below.
    const now = utcNow();
    const result = await this.tenantDb.forTenant(tenant.id, async (tx) => {
      const group = await this.groups.findBySlug(tx, slug);
      if (!group || group.status !== 'published') return null;
      const [children, listingType] = await Promise.all([
        this.listings.list(tx, { groupId: group.id, partnerId: group.partnerId }),
        this.listingTypes.findById(tx, group.listingTypeId),
      ]);
      if (group.partnerPublic.status !== 'approved') return null;
      const published = children.filter((listing) => listing.status === 'published');
      const rules = await this.pricingRules.listByListings(
        tx,
        published.map((listing) => listing.id),
      );
      return toPublicListingGroupDetailResponse(
        group,
        children,
        listingType,
        campaignsByListing(published, rules, now),
      );
    });
    if (!result) throw new ListingGroupNotFound();
    return result;
  }
}

/**
 * One campaign per room, all judged against a single clock so two rooms on the
 * same page cannot disagree about whether a campaign is still running. Each
 * summary uses the room resource timezone, the same boundary used to price it.
 */
function campaignsByListing(
  listings: readonly { id: string; resourceTimezone: string }[],
  rules: readonly (CampaignRuleView & { listingId: string })[],
  now: Date,
): Map<string, SaleCampaignSummary> {
  const byListing = new Map<string, CampaignRuleView[]>();
  for (const rule of rules) {
    const bucket = byListing.get(rule.listingId);
    if (bucket) bucket.push(rule);
    else byListing.set(rule.listingId, [rule]);
  }
  const campaigns = new Map<string, SaleCampaignSummary>();
  for (const listing of listings) {
    const campaign = summarizeSaleCampaign(
      byListing.get(listing.id) ?? [],
      now,
      listing.resourceTimezone,
    );
    if (campaign) campaigns.set(listing.id, campaign);
  }
  return campaigns;
}
