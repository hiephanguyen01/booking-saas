import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import {
  PROMO_CONTEXT_LOOKUP,
  type IPromoContextLookup,
  type ListingScope,
} from '../domain/ports/promo-context-lookup.port';
import {
  checkApplicability,
  evaluatePromo,
  selectBestAutoCampaign,
  type PromoContext,
  type PromoRejection,
  type PromotionSpec,
} from '../domain/promotion-discount';

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
  /** The applied code, or null for an auto-campaign. */
  promoCode: string | null;
  discountAmount: bigint;
  finalAmount: bigint;
  usageLimitPerCustomer: number | null;
  snapshot: PromotionSnapshot;
}

export interface PreparePromotionParams {
  /** A customer-entered code (wins over auto-campaigns). Omitted/null → auto-campaign path. */
  code?: string | null;
  listingId: string;
  amount: bigint;
  slotStart: Date | null;
  customerId: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
}

/** Maps a domain rejection to the HTTP status the storefront expects (§12.3). */
function rejectionException(rejection: PromoRejection): BadRequestException | ConflictException {
  const body = { statusCode: rejection === 'PROMO_LIMIT_REACHED' ? 409 : 400, code: rejection, message: rejection };
  return rejection === 'PROMO_LIMIT_REACHED' ? new ConflictException(body) : new BadRequestException(body);
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function snapshotOf(promo: PromotionSpec, discountAmount: bigint): PromotionSnapshot {
  return {
    promotionId: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue.toString(),
    fundedBy: promo.fundedBy,
    discountAmount: discountAmount.toString(),
  };
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
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly tenantDb: TenantDbService,
  ) {}

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

  /**
   * Resolve the single promotion to apply (§12.1 no-stacking, code-wins). A valid
   * customer-entered code short-circuits auto-campaigns; otherwise the best
   * applicable auto-campaign is chosen. Returns null when nothing applies (and no
   * code was entered). Throws a stable i18n exception when an explicit code is bad.
   * No usage is claimed here. Runs inside the caller's tx (booking creation).
   */
  async prepare(tx: PrismaTx, params: PreparePromotionParams): Promise<PreparedPromotion | null> {
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

  /**
   * Atomically claim one use and record the `reserved` redemption for a freshly
   * inserted booking. Must run in the SAME tx as the booking insert. A lost race
   * for the last use — total or per-customer — throws PROMO_LIMIT_REACHED, rolling
   * the booking back.
   */
  async reserve(
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
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${data.promotionId}), hashtext(${data.customerId}))`,
      );
      const used = await this.redemptions.countActiveByCustomer(tx, data.promotionId, data.customerId);
      if (used >= data.usageLimitPerCustomer) throw rejectionException('PROMO_LIMIT_REACHED');
    }
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
