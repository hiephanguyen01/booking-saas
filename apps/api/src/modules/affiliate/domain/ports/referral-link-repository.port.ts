import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  NewReferralLink,
  ReferralLinkState,
} from '../entities/referral-link.entity';
import type { ReferralLinkRecord } from './referral-link-reader.port';

export const REFERRAL_LINK_REPOSITORY = Symbol('REFERRAL_LINK_REPOSITORY');

export interface ReferralClickData {
  referralLinkId: string;
  visitorId: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

export interface IReferralLinkRepository {
  create(
    tx: PrismaTx,
    link: NewReferralLink,
  ): Promise<ReferralLinkRecord>;
  /** Narrow write-state load used only by the ownership-gated delete path. */
  loadById(tx: PrismaTx, id: string): Promise<ReferralLinkState | null>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  incrementClicks(tx: PrismaTx, id: string): Promise<void>;
  /** Log one click (visitor/ip/ua) for the funnel + rate limiting (§7.8). */
  recordClick(
    tx: PrismaTx,
    tenantId: string,
    data: ReferralClickData,
  ): Promise<void>;
}
