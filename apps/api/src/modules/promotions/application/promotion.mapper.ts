import type { PromotionResponse, PromoUsageStatsResponse } from '@booking/contracts';
import type { PromotionRecord } from '../domain/ports/promotion-repository.port';
import type { RedemptionUsageStats } from '../domain/ports/promo-redemption-repository.port';

export function toPromotionResponse(p: PromotionRecord): PromotionResponse {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    discountType: p.discountType,
    discountValue: p.discountValue.toString(),
    maxDiscount: p.maxDiscount?.toString() ?? null,
    fundedBy: p.fundedBy,
    appliesTo: p.appliesTo,
    appliesToId: p.appliesToId,
    minOrderAmount: p.minOrderAmount?.toString() ?? null,
    usageLimitTotal: p.usageLimitTotal,
    redeemedCount: p.redeemedCount,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toUsageStatsResponse(p: PromotionRecord, stats: RedemptionUsageStats): PromoUsageStatsResponse {
  return {
    promotionId: p.id,
    code: p.code,
    usageLimitTotal: p.usageLimitTotal,
    redeemedCount: p.redeemedCount,
    reservedCount: stats.reservedCount,
    appliedCount: stats.appliedCount,
    releasedCount: stats.releasedCount,
    totalDiscount: stats.totalDiscount.toString(),
  };
}
