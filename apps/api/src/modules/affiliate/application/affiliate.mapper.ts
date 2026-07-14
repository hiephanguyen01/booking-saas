import type {
  AffiliateCommissionResponse,
  AffiliateListItem,
  AffiliateResponse,
  AffiliateStatsResponse,
  ReferralLinkResponse,
} from '@booking/contracts';
import type { AffiliateRecord, AffiliateWithUser } from '../domain/ports/affiliate-repository.port';
import type { ReferralLinkRecord } from '../domain/ports/referral-link-repository.port';
import type {
  AffiliateCommissionTotals,
  AffiliateCommissionWithBooking,
} from '../domain/ports/affiliate-commission-repository.port';

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
