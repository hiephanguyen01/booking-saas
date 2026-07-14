import { Inject, Injectable } from '@nestjs/common';
import type { AutoCampaignInput, AutoCampaignResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import { utcNow } from '../../../../shared/time/time';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import {
  PROMO_CONTEXT_LOOKUP,
  type IPromoContextLookup,
} from '../../domain/ports/promo-context-lookup.port';
import { selectBestAutoCampaign } from '../../domain/promotion-discount';

/**
 * Storefront preview of the best auto-applied campaign for a slot (§12.1 Phase 2).
 * Read-only, code-less, no customer identity — first-booking / per-customer limits
 * are enforced authoritatively at booking creation. Returns `null` when none apply.
 */
@Injectable()
export class ResolveAutoCampaignUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, input: AutoCampaignInput): Promise<AutoCampaignResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const amount = vnd(input.amount);

    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const scope = await this.lookup.getListingScope(tx, input.listingId);
      if (!scope) return null;
      const candidates = await this.promotions.listActiveAutoCampaigns(tx);
      const best = selectBestAutoCampaign(candidates, {
        listingId: scope.listingId,
        listingTypeId: scope.listingTypeId,
        groupId: scope.groupId,
        categoryId: scope.categoryId,
        partnerId: scope.partnerId,
        amount,
        now: utcNow(),
        slotStart: input.start ? new Date(input.start) : null,
        timezone: scope.timezone,
      });
      if (!best) return null;
      return {
        promotionId: best.promo.id,
        name: best.promo.name,
        discountAmount: best.discountAmount.toString(),
        finalAmount: best.finalAmount.toString(),
      };
    });
  }
}
