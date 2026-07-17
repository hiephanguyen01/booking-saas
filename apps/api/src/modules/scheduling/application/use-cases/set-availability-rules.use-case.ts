import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityRuleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../listing/domain/ports/listing-repository.port';
import {
  AVAILABILITY_RULE_REPOSITORY,
  type AvailabilityRuleRecord,
  type IAvailabilityRuleRepository,
} from '../../domain/ports/availability-rule-repository.port';
import {
  AVAILABILITY_CACHE,
  type IAvailabilityCache,
} from '../../domain/ports/availability-cache.port';
import { assertListing, type ManageContext } from '../availability-support';

/** Replace a listing's whole weekly availability rule set — §7.4/§9. */
@Injectable()
export class SetAvailabilityRulesUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(AVAILABILITY_RULE_REPOSITORY) private readonly rules: IAvailabilityRuleRepository,
    private readonly tenantDb: TenantDbService,
    @Inject(AVAILABILITY_CACHE) private readonly cache: IAvailabilityCache,
  ) {}

  async execute(
    ctx: ManageContext,
    listingId: string,
    rules: AvailabilityRuleInput[],
  ): Promise<AvailabilityRuleRecord[]> {
    const { saved, resourceId } = await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const listing = await assertListing(this.listings, tx, listingId, ctx.partnerId);
      const saved = await this.rules.replaceForListing(tx, ctx.tenantId, listingId, rules);
      return { saved, resourceId: listing.resourceId };
    });
    // Open windows changed → the cached slots for this resource are stale (§9.1).
    await this.cache.invalidateResource(resourceId);
    return saved;
  }
}
