import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { TenantDbService, type PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../shared/time/time';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../domain/ports/promotion-repository.port';
import {
  PROMO_REDEMPTION_REPOSITORY,
  type IPromoRedemptionRepository,
} from '../domain/ports/promo-redemption-repository.port';
import { evaluatePromo, type PromoRejection } from '../domain/promotion-discount';

/** Immutable snapshot stored on the booking (§12.5 — editing the program later cannot alter it). */
export interface PromotionSnapshot {
  promotionId: string;
  code: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  fundedBy: 'tenant' | 'partner';
  discountAmount: string;
}

export interface PreparedPromotion {
  promotionId: string;
  promoCode: string;
  discountAmount: bigint;
  finalAmount: bigint;
  snapshot: PromotionSnapshot;
}

/** Maps a domain rejection to the HTTP status the storefront expects (§12.3). */
function rejectionException(rejection: PromoRejection): BadRequestException | ConflictException {
  const body = { statusCode: rejection === 'PROMO_LIMIT_REACHED' ? 409 : 400, code: rejection, message: rejection };
  return rejection === 'PROMO_LIMIT_REACHED' ? new ConflictException(body) : new BadRequestException(body);
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Cross-module promotion application (§12.3). The booking module composes this
 * INSIDE its own `forTenant` transaction so the redemption + the atomic usage
 * claim + the booking insert commit or roll back together — this is deliberately
 * a synchronous, same-tx call (not an outbox event), the one thing the async
 * relay cannot express. The lifecycle transitions afterwards (applied/released)
 * ARE driven by outbox events and open their own transactions.
 */
@Injectable()
export class ApplyPromotionService {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_REDEMPTION_REPOSITORY) private readonly redemptions: IPromoRedemptionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  /**
   * Validate a code and compute the discount for a slot subtotal — no usage is
   * claimed here. Runs inside the caller's tx (booking creation). Throws a stable
   * i18n exception on rejection.
   */
  async prepare(
    tx: PrismaTx,
    params: { code: string; listingId: string; amount: bigint },
  ): Promise<PreparedPromotion> {
    const code = normalizeCode(params.code);
    const promo = await this.promotions.findByCode(tx, code);
    if (!promo) throw rejectionException('PROMO_NOT_FOUND');

    const evaluation = evaluatePromo(promo, { listingId: params.listingId, amount: params.amount, now: utcNow() });
    if (!evaluation.ok) throw rejectionException(evaluation.rejection);

    return {
      promotionId: promo.id,
      promoCode: code,
      discountAmount: evaluation.discountAmount,
      finalAmount: evaluation.finalAmount,
      snapshot: {
        promotionId: promo.id,
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue.toString(),
        fundedBy: promo.fundedBy,
        discountAmount: evaluation.discountAmount.toString(),
      },
    };
  }

  /**
   * Atomically claim one use and record the `reserved` redemption for a freshly
   * inserted booking. Must run in the SAME tx as the booking insert. A lost race
   * for the last use throws PROMO_LIMIT_REACHED, rolling the booking back.
   */
  async reserve(
    tx: PrismaTx,
    tenantId: string,
    data: { promotionId: string; bookingId: string; customerId: string; discountAmount: bigint },
  ): Promise<void> {
    const claimed = await this.promotions.claimUsage(tx, data.promotionId);
    if (!claimed) throw rejectionException('PROMO_LIMIT_REACHED');
    await this.redemptions.reserve(tx, tenantId, {
      promotionId: data.promotionId,
      bookingId: data.bookingId,
      customerId: data.customerId,
      discountAmount: data.discountAmount,
    });
  }

  /** booking.confirmed → redemption `reserved → applied` (idempotent). */
  async markApplied(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, (tx) => this.redemptions.markApplied(tx, bookingId));
  }

  /**
   * booking expired/rejected/fully-refunded-cancel → redemption `released` and
   * the usage returned, both in one tx (idempotent — reversed exactly once).
   */
  async release(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const promotionId = await this.redemptions.release(tx, bookingId);
      if (promotionId) await this.promotions.releaseUsage(tx, promotionId);
    });
  }
}
