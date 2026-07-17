import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import {
  PROMO_REDEMPTION_REPOSITORY,
  type IPromoRedemptionRepository,
} from '../../domain/ports/promo-redemption-repository.port';
import {
  PROMO_CONTEXT_LOOKUP,
  type IPromoContextLookup,
  type ListingScope,
} from '../../domain/ports/promo-context-lookup.port';
import {
  checkApplicability,
  evaluatePromo,
  selectBestAutoCampaign,
  type PromoContext,
} from '../../domain/promotion-discount';
import {
  normalizeCode,
  snapshotOf,
  type PreparedPromotion,
  type PreparePromotionParams,
} from '../../domain/promotion-application';
import { rejectionException } from '../promo-rejection';

/**
 * Resolve the single promotion to apply (§12.1 no-stacking, code-wins). A valid
 * customer-entered code short-circuits auto-campaigns; otherwise the best
 * applicable auto-campaign is chosen. Returns null when nothing applies (and no
 * code was entered). Throws a stable i18n exception when an explicit code is bad.
 * No usage is claimed here.
 *
 * Cross-module promotion application (§12.3): the booking module composes this
 * INSIDE its own `forTenant` transaction (booking creation) so the redemption +
 * the atomic usage claim + the booking insert commit or roll back together —
 * this is deliberately a synchronous, same-tx call (not an outbox event), the
 * one thing the async relay cannot express.
 */
@Injectable()
export class PreparePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_REDEMPTION_REPOSITORY) private readonly redemptions: IPromoRedemptionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
  ) {}

  async execute(tx: PrismaTx, params: PreparePromotionParams): Promise<PreparedPromotion | null> {
    const scope = await this.lookup.getListingScope(tx, params.listingId);
    if (!scope) {
      if (params.code) throw rejectionException('PROMO_NOT_APPLICABLE');
      return null;
    }
    const ctx = await this.baseContext(tx, scope, params);

    // ── Code path (customer-entered): the code always wins over any auto-campaign.
    if (params.code) {
      const code = normalizeCode(params.code);
      const promo = await this.promotions.findByCode(tx, code);
      if (!promo || promo.code === null) throw rejectionException('PROMO_NOT_FOUND');
      const customerRedemptions = await this.redemptions.countActiveByCustomer(tx, promo.id, params.customerId);
      const evaluation = evaluatePromo(promo, { ...ctx, customerRedemptions });
      if (!evaluation.ok) throw rejectionException(evaluation.rejection);
      return {
        promotionId: promo.id,
        promoCode: promo.code,
        discountAmount: evaluation.discountAmount,
        finalAmount: evaluation.finalAmount,
        usageLimitPerCustomer: promo.usageLimitPerCustomer,
        snapshot: snapshotOf(promo, evaluation.discountAmount),
      };
    }

    // ── Auto-campaign path: apply the best code-less campaign, if any.
    const candidates = await this.promotions.listActiveAutoCampaigns(tx);
    const best = selectBestAutoCampaign(candidates, ctx);
    if (!best) return null;
    // Verify the winner's per-customer limit (skipped during selection — it needs a per-promo count).
    if (best.promo.usageLimitPerCustomer !== null) {
      const used = await this.redemptions.countActiveByCustomer(tx, best.promo.id, params.customerId);
      if (checkApplicability(best.promo, { ...ctx, customerRedemptions: used }) !== null) return null;
    }
    return {
      promotionId: best.promo.id,
      promoCode: null,
      discountAmount: best.discountAmount,
      finalAmount: best.finalAmount,
      usageLimitPerCustomer: best.promo.usageLimitPerCustomer,
      snapshot: snapshotOf(best.promo, best.discountAmount),
    };
  }

  /** Build the evaluation context for a listing/slot/customer (per-promo counts filled in later). */
  private async baseContext(
    tx: PrismaTx,
    scope: ListingScope,
    params: PreparePromotionParams,
  ): Promise<PromoContext> {
    const customerPriorBookings = await this.lookup.countPriorBookings(tx, {
      customerId: params.customerId,
      email: params.customerEmail,
      phone: params.customerPhone,
    });
    return {
      listingId: scope.listingId,
      listingTypeId: scope.listingTypeId,
      groupId: scope.groupId,
      categoryId: scope.categoryId,
      partnerId: scope.partnerId,
      amount: params.amount,
      now: utcNow(),
      slotStart: params.slotStart,
      timezone: scope.timezone,
      customerPriorBookings,
    };
  }
}
