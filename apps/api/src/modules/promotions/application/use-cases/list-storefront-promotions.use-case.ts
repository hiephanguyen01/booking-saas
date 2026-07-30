import { Inject, Injectable } from '@nestjs/common';
import type {
  StorefrontPromotion,
  StorefrontPromotionsInput,
  StorefrontPromotionsResponse,
} from '@booking/contracts';
import { vnd } from '../../../../shared/money/money';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { evaluatePromo } from '../../domain/promotion-discount';
import {
  PROMO_CONTEXT_LOOKUP,
  type IPromoContextLookup,
} from '../../domain/ports/promo-context-lookup.port';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';

/** Lists public promo codes together with their best-effort checkout eligibility. */
@Injectable()
export class ListStorefrontPromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    input: StorefrontPromotionsInput,
  ): Promise<StorefrontPromotionsResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const amount = vnd(input.amount);
    const now = utcNow();

    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const scope = await this.lookup.getListingScope(tx, input.listingId);
      if (!scope) return [];

      const candidates = await this.promotions.listStorefrontVisibleCodes(tx);
      const items = candidates.flatMap((promotion) => {
        if (promotion.code === null) return [];
        const evaluation = evaluatePromo(promotion, {
          listingId: scope.listingId,
          listingTypeId: scope.listingTypeId,
          groupId: scope.groupId,
          categoryId: scope.categoryId,
          partnerId: scope.partnerId,
          amount,
          now,
          slotStart: input.start ? new Date(input.start) : null,
          timezone: scope.timezone,
        });
        return [toStorefrontPromotion(promotion, evaluation, amount)];
      });

      return items.sort(compareStorefrontPromotions);
    });
  }
}

function toStorefrontPromotion(
  promotion: PromotionRecord,
  evaluation: ReturnType<typeof evaluatePromo>,
  amount: bigint,
): StorefrontPromotion {
  return {
    code: promotion.code!,
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue.toString(),
    maxDiscount: promotion.maxDiscount?.toString() ?? null,
    minOrderAmount: promotion.minOrderAmount?.toString() ?? null,
    firstBookingOnly: promotion.firstBookingOnly,
    startsAt: promotion.startsAt?.toISOString() ?? null,
    endsAt: promotion.endsAt?.toISOString() ?? null,
    eligible: evaluation.ok,
    discountAmount: evaluation.ok ? evaluation.discountAmount.toString() : '0',
    finalAmount: evaluation.ok ? evaluation.finalAmount.toString() : amount.toString(),
    ...(evaluation.ok ? {} : { error: evaluation.rejection }),
  };
}

function compareStorefrontPromotions(a: StorefrontPromotion, b: StorefrontPromotion): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  const discountDifference = BigInt(b.discountAmount) - BigInt(a.discountAmount);
  if (discountDifference !== 0n) return discountDifference > 0n ? 1 : -1;
  return a.name.localeCompare(b.name, 'vi');
}
