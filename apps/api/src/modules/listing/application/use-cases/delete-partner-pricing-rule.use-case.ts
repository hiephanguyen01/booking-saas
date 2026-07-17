import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
      if (!listing)
        throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
      if (listing.partnerId !== partnerId) {
        throw new ForbiddenException({
          code: 'LISTING_NOT_OWNED',
          message: 'This listing belongs to another partner',
        });
      }
      const rule = await this.rules.findById(tx, ruleId);
      if (!rule || rule.listingId !== listingId) {
        throw new NotFoundException({
          code: 'PRICING_RULE_NOT_FOUND',
          message: 'Pricing rule not found',
        });
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
