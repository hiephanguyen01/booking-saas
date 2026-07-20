import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

@Injectable()
export class CreatePartnerPricingRuleUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    listingId: string,
    input: PricingRuleInput,
  ): Promise<PricingRuleRecord> {
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
      if (!listing.bookingModes.includes(input.bookingMode)) {
        throw new BadRequestException({
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
      // Calendar edits are save/replace operations. Remove the previous exact
      // override for the same mode and scope so repeated saves stay deterministic.
      if (input.ruleType === 'date_range' || input.ruleType === 'date_time_range') {
        const existing = await this.rules.listByListing(tx, listingId);
        const paramsKey = JSON.stringify(input.params);
        if (input.ruleType === 'date_time_range') {
          const date = String(input.params.date);
          const from = String(input.params.from);
          const to = String(input.params.to);
          const overlap = existing.find(
            (rule) =>
              rule.bookingMode === input.bookingMode &&
              rule.ruleType === 'date_time_range' &&
              String(rule.params.date) === date &&
              JSON.stringify(rule.params) !== paramsKey &&
              from < String(rule.params.to) &&
              to > String(rule.params.from),
          );
          if (overlap) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'PRICING_RULE_OVERLAP',
              message: `Pricing window overlaps ${String(overlap.params.from)}–${String(overlap.params.to)}`,
            });
          }
        }
        for (const rule of existing) {
          if (
            rule.bookingMode === input.bookingMode &&
            rule.ruleType === input.ruleType &&
            JSON.stringify(rule.params) === paramsKey
          )
            await this.rules.delete(tx, rule.id);
        }
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
