import { Inject, Injectable } from '@nestjs/common';
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
import { assertListing, type ManageContext } from '../availability-support';

/** List a listing's weekly availability rules — §7.4/§9. */
@Injectable()
export class ListAvailabilityRulesUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(AVAILABILITY_RULE_REPOSITORY) private readonly rules: IAvailabilityRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(ctx: ManageContext, listingId: string): Promise<AvailabilityRuleRecord[]> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await assertListing(this.listings, tx, listingId, ctx.partnerId);
      return this.rules.listByListing(tx, listingId);
    });
  }
}
