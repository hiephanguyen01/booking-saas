import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type {
  ReferralLinkState,
  ReferralTarget,
} from '../entities/referral-link.entity';

export const REFERRAL_LINK_READER = Symbol('REFERRAL_LINK_READER');

/** Referral-link response projection, enriched with the targeted listing title. */
export interface ReferralLinkRecord extends ReferralLinkState {
  /** Null for tenant-home links or when a targeted listing was deleted. */
  listingTitle: string | null;
}

/** Filters for the paginated referral-link list (§15.3). */
export interface ReferralLinkListFilter {
  page: number;
  pageSize: number;
  /** Case-insensitive search over the referral code + targeted listing title. */
  q?: string;
}

export interface IReferralLinkReader {
  /** Pre-insert collision check; the DB unique constraint remains the arbiter. */
  findByCode(
    tx: PrismaTx,
    code: string,
  ): Promise<ReferralLinkRecord | null>;
  listByAffiliate(
    tx: PrismaTx,
    affiliateId: string,
  ): Promise<ReferralLinkRecord[]>;
  /** One page of an affiliate's referral links (newest first) + matching total. */
  listByAffiliatePaginated(
    tx: PrismaTx,
    affiliateId: string,
    params: ReferralLinkListFilter,
  ): Promise<RepoPage<ReferralLinkRecord>>;
  /** Total clicks across an affiliate's links (stats). */
  totalClicksForAffiliate(
    tx: PrismaTx,
    affiliateId: string,
  ): Promise<number>;
  countByAffiliate(tx: PrismaTx, affiliateId: string): Promise<number>;
}

/** Keep this domain type visible at the projection boundary. */
export type { ReferralTarget };
