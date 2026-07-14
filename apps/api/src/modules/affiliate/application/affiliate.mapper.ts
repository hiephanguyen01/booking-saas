import type {
  AffiliateCommissionResponse,
  AffiliateDetailResponse,
  AffiliateListItem,
  AffiliateRateResponse,
  AffiliateResponse,
  AffiliateStatsResponse,
  AffiliateStatusResponse,
  ReferralLinkResponse,
} from '@booking/contracts';
import type { AffiliateRecord, AffiliateWithUser } from '../domain/ports/affiliate-repository.port';
import type { ReferralLinkRecord } from '../domain/ports/referral-link-repository.port';
import type {
  AffiliateCommissionTotals,
  AffiliateCommissionWithBooking,
} from '../domain/ports/affiliate-commission-repository.port';
import type { TenantAffiliateDetail } from './use-cases/get-tenant-affiliate.use-case';

export function toReferralLinkResponse(r: ReferralLinkRecord): ReferralLinkResponse {
  return {
    id: r.id,
    code: r.code,
    target: r.target,
    listingId: r.listingId,
    clicksCount: r.clicksCount,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toAffiliateResponse(a: AffiliateRecord & { tenantName: string }): AffiliateResponse {
  return {
    id: a.id,
    tenantId: a.tenantId,
    tenantName: a.tenantName,
    status: a.status,
    customRate: a.customRate === null ? null : a.customRate.toString(),
    createdAt: a.createdAt.toISOString(),
  };
}

export function toAffiliateListItem(
  a: AffiliateWithUser,
  extras: { linksCount: number; totalEarned: bigint },
): AffiliateListItem {
  return {
    id: a.id,
    userId: a.userId,
    userName: a.userName,
    userEmail: a.userEmail,
    status: a.status,
    customRate: a.customRate === null ? null : a.customRate.toString(),
    linksCount: extras.linksCount,
    totalEarned: extras.totalEarned.toString(),
    createdAt: a.createdAt.toISOString(),
  };
}

/** Detail view: profile row + referral links + commission history (§15.3). */
export function toAffiliateDetailResponse(d: TenantAffiliateDetail): AffiliateDetailResponse {
  return {
    affiliate: toAffiliateListItem(d.affiliate, { linksCount: d.links.length, totalEarned: d.totalEarned }),
    links: d.links.map(toReferralLinkResponse),
    commissions: d.commissions.map(toAffiliateCommissionResponse),
  };
}

/** Minimal echo after an approve/suspend (§15.1). */
export function toAffiliateStatusResponse(a: AffiliateRecord): AffiliateStatusResponse {
  return { id: a.id, status: a.status };
}

/** Minimal echo after setting/clearing a custom rate (§15.2). */
export function toAffiliateRateResponse(a: AffiliateRecord): AffiliateRateResponse {
  return { id: a.id, customRate: a.customRate === null ? null : a.customRate.toString() };
}

export function toAffiliateCommissionResponse(c: AffiliateCommissionWithBooking): AffiliateCommissionResponse {
  return {
    id: c.id,
    bookingId: c.bookingId,
    bookingCode: c.bookingCode,
    amount: c.amount.toString(),
    status: c.status,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toStatsResponse(totals: AffiliateCommissionTotals, clicks: number): AffiliateStatsResponse {
  const conversionRate = clicks > 0 ? Math.round((totals.bookings / clicks) * 10000) / 10000 : 0;
  return {
    clicks,
    bookings: totals.bookings,
    conversionRate,
    pendingCommission: totals.pending.toString(),
    confirmedCommission: totals.confirmed.toString(),
    paidCommission: totals.paid.toString(),
  };
}
