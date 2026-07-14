import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const REFERRAL_LINK_REPOSITORY = Symbol('REFERRAL_LINK_REPOSITORY');

export type ReferralTarget = 'tenant_home' | 'listing';

export interface ReferralLinkRecord {
  id: string;
  tenantId: string;
  affiliateId: string;
  code: string;
  target: ReferralTarget;
  listingId: string | null;
  clicksCount: number;
  createdAt: Date;
}

export interface CreateReferralLinkData {
  affiliateId: string;
  code: string;
  target: ReferralTarget;
  listingId: string | null;
}

export interface IReferralLinkRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateReferralLinkData): Promise<ReferralLinkRecord>;
  findByCode(tx: PrismaTx, code: string): Promise<ReferralLinkRecord | null>;
  listByAffiliate(tx: PrismaTx, affiliateId: string): Promise<ReferralLinkRecord[]>;
  findById(tx: PrismaTx, id: string): Promise<ReferralLinkRecord | null>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  incrementClicks(tx: PrismaTx, id: string): Promise<void>;
  /** Log one click (visitor/ip/ua) for the funnel + rate limiting (§7.8). */
  recordClick(
    tx: PrismaTx,
    tenantId: string,
    data: { referralLinkId: string; visitorId: string | null; ipHash: string | null; userAgent: string | null },
  ): Promise<void>;
  /** Total clicks across an affiliate's links (stats). */
  totalClicksForAffiliate(tx: PrismaTx, affiliateId: string): Promise<number>;
  countByAffiliate(tx: PrismaTx, affiliateId: string): Promise<number>;
}
