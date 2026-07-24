import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AFFILIATE_ATTRIBUTION_READER = Symbol(
  'AFFILIATE_ATTRIBUTION_READER',
);

/** Minimal approved-link projection for the public click hot path. */
export interface ApprovedReferralClick {
  linkId: string;
}

/** Approved affiliate/link facts needed before attribution fraud checks. */
export interface AffiliateAttributionCandidate {
  affiliateId: string;
  affiliateUserId: string;
  referralCode: string;
  customRate: bigint | null;
}

export interface AttributionUserContact {
  email: string;
  phone: string | null;
}

/**
 * Narrow cross-table projections for click validation and booking attribution.
 * All methods run on the caller's existing RLS-scoped transaction.
 */
export interface IAffiliateAttributionReader {
  findApprovedForClick(
    tx: PrismaTx,
    code: string,
  ): Promise<ApprovedReferralClick | null>;
  findApprovedCandidate(
    tx: PrismaTx,
    code: string,
  ): Promise<AffiliateAttributionCandidate | null>;
  findUserContact(
    tx: PrismaTx,
    userId: string,
  ): Promise<AttributionUserContact | null>;
  isPartnerMember(
    tx: PrismaTx,
    partnerId: string,
    userId: string,
  ): Promise<boolean>;
}
