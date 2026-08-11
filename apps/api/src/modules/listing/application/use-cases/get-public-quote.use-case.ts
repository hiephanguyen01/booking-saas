import { Inject, Injectable } from '@nestjs/common';
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
import { ListingNotFound } from '../../domain/errors/listing-errors';
import { ModeNotEnabled } from '../../domain/errors/pricing-rule-errors';
import { ResolveTaxUseCase } from '../../../finance/application/use-cases/resolve-tax.use-case';
import { vatOf } from '../../../../shared/domain/tax/tax';

/** Storefront quote for a listing + mode + time range (read-only, host-resolved). */
@Injectable()
export class GetPublicQuoteUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(PRICING_RULE_REPOSITORY) private readonly rules: IPricingRuleRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly resolveTax: ResolveTaxUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string, query: QuoteQuery): Promise<QuoteResponse> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const listing = await this.listings.findPublicBySlug(tx, slug);
      if (!listing) {
        throw new ListingNotFound();
      }
      if (!listing.bookingModes.includes(query.mode)) {
        throw new ModeNotEnabled(query.mode);
      }
      const pricingRules = await this.rules.listByListing(tx, listing.id);
      const quote = priceQuote({
        mode: query.mode,
        modeConfig: listing.modeConfig as ModeConfig,
        pricingRules: pricingRules.map((r) => ({
          id: r.id,
          bookingMode: r.bookingMode,
          ruleType: r.ruleType,
          params: r.params,
          price: r.price,
          salePrice: r.salePrice,
          priority: r.priority,
        })),
        timezone: listing.resourceTimezone,
        startUtc: new Date(query.from),
        endUtc: new Date(query.to),
        quantity: query.quantity,
        depositPercent: listing.depositPercent,
        bookingSelection: listing.bookingSelection,
        packageId: query.packageId,
      });

      // Same resolver booking creation freezes onto the booking (§VAT), so the
      // rate a customer is quoted can never disagree with the one they are
      // charged. Resolved for the SERVICE date, not today.
      const tax = await this.resolveTax.execute(tx, {
        tenantId: tenant.id,
        partnerId: listing.partnerId,
        listingTypeId: listing.listingTypeId,
        serviceDate: new Date(query.from),
      });
      return {
        ...quote,
        vatBps: tax.vatBps,
        // Must go through the seller's own regime: `vatFromGross` is the
        // deduction formula, and using it for a percentage-method seller quotes
        // 280,000 × 4/104 = 10,769 where the right answer is 280,000 × 4% = 11,200.
        vatAmount: vatOf(
          BigInt(quote.subtotal),
          tax.vatBps,
          tax.method ?? 'deduction',
        ).toString(),
      };
    });
  }
}
