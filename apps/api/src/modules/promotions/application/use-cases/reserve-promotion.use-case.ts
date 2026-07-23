import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import {
  PROMO_REDEMPTION_REPOSITORY,
  type IPromoRedemptionRepository,
} from '../../domain/ports/promo-redemption-repository.port';
import {
  PromoRedemption,
  exceedsPerCustomerLimit,
} from '../../domain/entities/promo-redemption.entity';
import { rejectionException } from '../promo-rejection';

/**
 * Atomically claim one use and record the `reserved` redemption for a freshly
 * inserted booking. Must run in the SAME tx as the booking insert (§12.3 —
 * composed inside the booking module's `forTenant` transaction). A lost race
 * for the last use — total or per-customer — throws PROMO_LIMIT_REACHED, rolling
 * the booking back.
 */
@Injectable()
export class ReservePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_REDEMPTION_REPOSITORY) private readonly redemptions: IPromoRedemptionRepository,
  ) {}

  async execute(
    tx: PrismaTx,
    tenantId: string,
    data: {
      promotionId: string;
      bookingId: string;
      customerId: string;
      discountAmount: bigint;
      usageLimitPerCustomer: number | null;
    },
  ): Promise<void> {
    // Per-customer cap: serialise by (promotion, customer) so two tabs can't both slip past (§12.3).
    if (data.usageLimitPerCustomer !== null) {
      await this.redemptions.lockPerCustomer(tx, data.promotionId, data.customerId);
      const used = await this.redemptions.countActiveByCustomer(
        tx,
        data.promotionId,
        data.customerId,
      );
      if (exceedsPerCustomerLimit(used, data.usageLimitPerCustomer))
        throw rejectionException('PROMO_LIMIT_REACHED');
    }
    const claimed = await this.promotions.claimUsage(tx, data.promotionId);
    if (!claimed) throw rejectionException('PROMO_LIMIT_REACHED');
    await this.redemptions.reserve(
      tx,
      tenantId,
      PromoRedemption.open({
        promotionId: data.promotionId,
        bookingId: data.bookingId,
        customerId: data.customerId,
        discountAmount: data.discountAmount,
      }),
    );
  }
}
