import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PricingRuleInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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

/** Conditional pricing (weekday/weekend + golden-hour windows) for a listing (§7.3). */
@Injectable()
export class CreatePricingRuleUseCase {
  constructor(
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    listingId: string,
    input: PricingRuleInput,
  ): Promise<PricingRuleRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listing = await this.listings.findById(tx, listingId);
      if (!listing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
        });
      }
      if (!listing.bookingModes.includes(input.bookingMode)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MODE_NOT_ENABLED',
          message: `Listing does not enable "${input.bookingMode}"`,
        });
      }
      if (listing.bookingSelection === 'fixed_packages') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PACKAGE_PRICING_FIXED',
          message: 'Fixed-package prices are managed in the listing package configuration',
        });
      }
      const created = await this.rules.create(tx, tenantId, {
        listingId,
        bookingMode: input.bookingMode,
        ruleType: input.ruleType,
        params: input.params,
        price: input.price,
        salePrice: input.salePrice ?? null,
        priority: input.priority,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'pricing_rule.created',
        payload: { pricingRuleId: created.id, listingId },
      });
      return created;
    });
  }
}
