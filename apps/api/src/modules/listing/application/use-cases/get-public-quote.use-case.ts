import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ModeConfig, QuoteQuery, QuoteResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';
import {
  PRICING_RULE_REPOSITORY,
  type IPricingRuleRepository,
} from '../../domain/ports/pricing-rule-repository.port';
import { priceQuote } from '../pricing';

/** Storefront quote for a listing + mode + time range (read-only, host-resolved). */
@Injectable()
export class GetPublicQuoteUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string, query: QuoteQuery): Promise<QuoteResponse> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const listing = await this.listings.findPublicBySlug(tx, slug);
      if (!listing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
        });
      }
      if (!listing.bookingModes.includes(query.mode)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MODE_NOT_ENABLED',
          message: `Listing does not enable "${query.mode}"`,
        });
      }
      const pricingRules = await this.rules.listByListing(tx, listing.id);
      return priceQuote({
        mode: query.mode,
        modeConfig: listing.modeConfig as ModeConfig,
        pricingRules: pricingRules.map((r) => ({
          id: r.id,
          bookingMode: r.bookingMode,
          ruleType: r.ruleType,
          params: r.params,
          price: r.price,
          priority: r.priority,
        })),
        timezone: listing.resourceTimezone,
        startUtc: new Date(query.from),
        endUtc: new Date(query.to),
        quantity: query.quantity,
        depositPercent: listing.depositPercent,
      });
    });
  }
}
