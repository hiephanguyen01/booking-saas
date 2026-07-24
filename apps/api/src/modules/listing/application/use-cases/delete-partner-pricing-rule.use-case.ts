import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import { PricingRuleNotFound } from '../../domain/errors/pricing-rule-errors';

@Injectable()
export class DeletePartnerPricingRuleUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(tenantId: string, partnerId: string, listingId: string, ruleId: string): Promise<void> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) throw new ListingNotFound();
      if (listing.partnerId !== partnerId) {
        throw new ListingNotOwned();
      }
      const rule = await this.rules.findById(tx, ruleId);
      if (!rule || rule.listingId !== listingId) {
        throw new PricingRuleNotFound();
      }
      await this.rules.delete(tx, ruleId);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'pricing_rule.deleted',
        payload: { pricingRuleId: ruleId, listingId },
      });
    });
  }
}
