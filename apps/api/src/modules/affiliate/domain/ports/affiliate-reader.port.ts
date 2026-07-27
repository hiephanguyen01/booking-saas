import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPageWithCounts } from '../../../../shared/pagination/pagination';
import type {
  AffiliateState,
  AffiliateStatus,
} from '../entities/affiliate.entity';

export const AFFILIATE_READER = Symbol('AFFILIATE_READER');

/** The base affiliate response shape (no relation joins). */
export type AffiliateRecord = AffiliateState;

/** An affiliate joined with its user + tenant, for tenant-side listing + the portal. */
export interface AffiliateWithUser extends AffiliateRecord {
  userName: string;
  userEmail: string;
  /** The affiliate user's contact phone (§7.1) — null when not provided. */
  userPhone: string | null;
  tenantName: string;
  /**
   * The tenant storefront's primary hostname (§6.1) — the origin this membership's
   * referral links resolve to. Null when the tenant has no primary domain mapped.
   */
  tenantHostname: string | null;
}

/** Filter + offset paging for the tenant-side affiliate list (§15.3). */
export interface ListAffiliatesFilter {
  status?: AffiliateStatus;
  page: number;
  pageSize: number;
}

export interface IAffiliateReader {
  findByUserWithTenant(
    tx: PrismaTx,
    id: string,
  ): Promise<AffiliateWithUser | null>;
  /**
   * One page of the tenant's affiliates (newest first), the matching `total`, and
   * per-status `counts` computed over every membership regardless of `filter.status`
   * (so the filter-tab chips always show their own totals).
   */
  list(
    tx: PrismaTx,
    filter: ListAffiliatesFilter,
  ): Promise<RepoPageWithCounts<AffiliateWithUser>>;
  /**
   * Cross-tenant resolution via the BYPASSRLS admin pool. This is strictly a
   * read projection and must remain filtered to the authenticated `userId`.
   */
  adminFindMembershipsByUser(userId: string): Promise<AffiliateWithUser[]>;
}
