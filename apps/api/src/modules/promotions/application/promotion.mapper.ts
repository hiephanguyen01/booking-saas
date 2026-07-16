import type {
  PromotionCategoryOption,
  PromotionDetailResponse,
  PromotionResponse,
  PromoUsageStatsResponse,
} from '@booking/contracts';
import type { PromotionRecord } from '../domain/ports/promotion-repository.port';
import type { PromoCategory } from '../domain/ports/promo-context-lookup.port';
import type { RedemptionUsageStats } from '../domain/ports/promo-redemption-repository.port';
import type { PromotionDetail } from './promotion-detail';

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
    firstBookingOnly: p.firstBookingOnly,
    usageLimitTotal: p.usageLimitTotal,
    usageLimitPerCustomer: p.usageLimitPerCustomer,
    timeWindows: p.timeWindows,
    redeemedCount: p.redeemedCount,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    status: p.status,
    createdByPartnerId: p.createdByPartnerId,
    fundingPartnerId: p.fundingPartnerId,
    partnerOptInAt: p.partnerOptInAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Read-one shape: the list response plus the resolved display names (§12.2). */
export function toPromotionDetailResponse(p: PromotionDetail): PromotionDetailResponse {
  return {
    ...toPromotionResponse(p),
    fundingPartnerName: p.fundingPartnerName,
    createdByPartnerName: p.createdByPartnerName,
    appliesToLabel: p.appliesToLabel,
  };
}

export function toPromotionCategoryOption(c: PromoCategory): PromotionCategoryOption {
  return { id: c.id, name: c.name, slug: c.slug };
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
