import {
  affiliatePayoutInfoSchema,
  type AffiliateCommissionResponse,
  type AffiliateDetailProfile,
  type AffiliateDetailResponse,
  type AffiliateListItem,
  type AffiliatePayoutInfo,
  type AffiliateRateResponse,
  type AffiliateResponse,
  type AffiliateStatsResponse,
  type AffiliateStatusResponse,
  type ReferralLinkResponse,
} from '@booking/contracts';
import type { EffectiveAffiliateRate } from '../domain/affiliate-rate';
import type { AffiliateRecord, AffiliateWithUser } from '../domain/ports/affiliate-repository.port';
import type { ReferralLinkRecord } from '../domain/ports/referral-link-repository.port';
import type {
  AffiliateCommissionTotals,
  AffiliateCommissionWithBooking,
} from '../domain/ports/affiliate-commission-repository.port';
import type { AffiliateMembership } from './use-cases/list-affiliate-memberships.use-case';
import type { TenantAffiliateDetail } from './use-cases/get-tenant-affiliate.use-case';
import type { TenantAffiliateRow } from './use-cases/list-tenant-affiliates.use-case';

/** The three `effectiveRate*` contract fields, from one resolved rate. */
function effectiveRateFields(rate: EffectiveAffiliateRate): {
  effectiveRate: string;
  effectiveRateType: EffectiveAffiliateRate['rateType'];
  effectiveRateSource: EffectiveAffiliateRate['source'];
} {
  return {
    effectiveRate: rate.rate.toString(),
    effectiveRateType: rate.rateType,
    effectiveRateSource: rate.source,
  };
}

/**
 * `affiliates.payout_info` is untyped jsonb written by earlier signups, so it is
 * parsed — not cast — on the way out: an unknown/legacy shape degrades to `{}`
 * rather than putting a value the contract forbids on the wire.
 */
function toPayoutInfo(raw: unknown): AffiliatePayoutInfo {
  const parsed = affiliatePayoutInfoSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** bookings / clicks, 0–1, rounded to 4 dp. No clicks → 0 (never a division by zero). */
function conversionRate(bookings: number, clicks: number): number {
  return clicks > 0 ? Math.round((bookings / clicks) * 10000) / 10000 : 0;
}

export function toReferralLinkResponse(r: ReferralLinkRecord): ReferralLinkResponse {
  return {
    id: r.id,
    code: r.code,
    target: r.target,
    listingId: r.listingId,
    listingTitle: r.listingTitle,
    clicksCount: r.clicksCount,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toAffiliateResponse(m: AffiliateMembership): AffiliateResponse {
  return {
    id: m.affiliate.id,
    tenantId: m.affiliate.tenantId,
    tenantName: m.affiliate.tenantName,
    tenantHostname: m.affiliate.tenantHostname,
    status: m.affiliate.status,
    customRate: m.affiliate.customRate === null ? null : m.affiliate.customRate.toString(),
    ...effectiveRateFields(m.effectiveRate),
    payoutInfo: toPayoutInfo(m.affiliate.payoutInfo),
    createdAt: m.affiliate.createdAt.toISOString(),
  };
}

export function toAffiliateListItem(
  a: AffiliateWithUser,
  extras: {
    linksCount: number;
    clicks: number;
    totals: AffiliateCommissionTotals;
    effectiveRate: EffectiveAffiliateRate;
  },
): AffiliateListItem {
  const { totals } = extras;
  return {
    id: a.id,
    userId: a.userId,
    userName: a.userName,
    userEmail: a.userEmail,
    status: a.status,
    customRate: a.customRate === null ? null : a.customRate.toString(),
    ...effectiveRateFields(extras.effectiveRate),
    linksCount: extras.linksCount,
    clicks: extras.clicks,
    bookings: totals.bookings,
    conversionRate: conversionRate(totals.bookings, extras.clicks),
    pendingCommission: totals.pending.toString(),
    confirmedCommission: totals.confirmed.toString(),
    paidCommission: totals.paid.toString(),
    // Deprecated: kept only until the tenant pages read the split above.
    totalEarned: (totals.confirmed + totals.paid).toString(),
    createdAt: a.createdAt.toISOString(),
  };
}

export function toTenantAffiliateListItem(row: TenantAffiliateRow): AffiliateListItem {
  return toAffiliateListItem(row.affiliate, {
    linksCount: row.linksCount,
    clicks: row.clicks,
    totals: row.totals,
    effectiveRate: row.effectiveRate,
  });
}

/**
 * The detail-view profile: the lean list row plus the fields the tenant needs to
 * pay the affiliate — phone, bank details, and the reversed/clawed-back buckets so
 * the earnings numbers reconcile. Not on the list row (§15.3, one lean query).
 */
export function toAffiliateDetailProfile(
  a: AffiliateWithUser,
  extras: {
    linksCount: number;
    clicks: number;
    totals: AffiliateCommissionTotals;
    effectiveRate: EffectiveAffiliateRate;
  },
): AffiliateDetailProfile {
  return {
    ...toAffiliateListItem(a, extras),
    phone: a.userPhone,
    payoutInfo: toPayoutInfo(a.payoutInfo),
    reversedCommission: extras.totals.reversed.toString(),
    clawedBackCommission: extras.totals.clawedBack.toString(),
  };
}

/** Detail view: profile row + referral links + commission history (§15.3). */
export function toAffiliateDetailResponse(d: TenantAffiliateDetail): AffiliateDetailResponse {
  return {
    affiliate: toAffiliateDetailProfile(d.affiliate, {
      linksCount: d.links.length,
      clicks: d.clicks,
      totals: d.totals,
      effectiveRate: d.effectiveRate,
    }),
    links: d.links.map(toReferralLinkResponse),
    commissions: d.commissions.map(toAffiliateCommissionResponse),
  };
}

/** Minimal echo after an approve/suspend (§15.1). */
export function toAffiliateStatusResponse(a: AffiliateRecord): AffiliateStatusResponse {
  return { id: a.id, status: a.status };
}

/** Echo after setting/clearing a custom rate (§15.2), with the rate now in force. */
export function toAffiliateRateResponse(
  a: AffiliateRecord,
  effectiveRate: EffectiveAffiliateRate,
): AffiliateRateResponse {
  return {
    id: a.id,
    customRate: a.customRate === null ? null : a.customRate.toString(),
    ...effectiveRateFields(effectiveRate),
  };
}

export function toAffiliateCommissionResponse(c: AffiliateCommissionWithBooking): AffiliateCommissionResponse {
  return {
    id: c.id,
    bookingId: c.bookingId,
    bookingCode: c.bookingCode,
    bookingStatus: c.bookingStatus,
    bookingTotal: c.bookingTotal === null ? null : c.bookingTotal.toString(),
    listingTitle: c.listingTitle,
    amount: c.amount.toString(),
    status: c.status,
    paidAt: c.paidAt === null ? null : c.paidAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
  };
}

export function toStatsResponse(totals: AffiliateCommissionTotals, clicks: number): AffiliateStatsResponse {
  return {
    clicks,
    bookings: totals.bookings,
    conversionRate: conversionRate(totals.bookings, clicks),
    pendingCommission: totals.pending.toString(),
    confirmedCommission: totals.confirmed.toString(),
    paidCommission: totals.paid.toString(),
    reversedCommission: totals.reversed.toString(),
    clawedBackCommission: totals.clawedBack.toString(),
  };
}
