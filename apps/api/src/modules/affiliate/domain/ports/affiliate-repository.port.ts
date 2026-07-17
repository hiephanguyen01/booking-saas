import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AFFILIATE_REPOSITORY = Symbol('AFFILIATE_REPOSITORY');

export type AffiliateStatus = 'pending' | 'approved' | 'suspended';

/** A full `affiliates` row. */
export interface AffiliateRecord {
  id: string;
  tenantId: string;
  userId: string;
  status: AffiliateStatus;
  /** Whole-percent override of the rule's affiliate rate (§15.2); null = use the rule. */
  customRate: bigint | null;
  payoutInfo: unknown;
  createdAt: Date;
}

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

export interface CreateAffiliateData {
  userId: string;
  payoutInfo: unknown;
}

/** Filter + offset paging for the tenant-side affiliate list (§15.3). */
export interface ListAffiliatesFilter {
  status?: AffiliateStatus;
  page: number;
  pageSize: number;
}

export interface IAffiliateRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateAffiliateData): Promise<AffiliateRecord>;
  findById(tx: PrismaTx, id: string): Promise<AffiliateRecord | null>;
  findByUser(tx: PrismaTx, userId: string): Promise<AffiliateRecord | null>;
  findByUserWithTenant(tx: PrismaTx, id: string): Promise<AffiliateWithUser | null>;
  /**
   * One page of the tenant's affiliates (newest first), the matching `total`, and
   * per-status `counts` computed over every membership regardless of `filter.status`
   * (so the filter-tab chips always show their own totals).
   */
  list(
    tx: PrismaTx,
    filter: ListAffiliatesFilter,
  ): Promise<{ items: AffiliateWithUser[]; total: number; counts: Record<string, number> }>;
  setStatus(tx: PrismaTx, id: string, status: AffiliateStatus): Promise<AffiliateRecord>;
  setCustomRate(tx: PrismaTx, id: string, customRate: bigint | null): Promise<AffiliateRecord>;
  /** Replace the affiliate's payout (bank) details — the correction path for a typo'd account. */
  setPayoutInfo(tx: PrismaTx, id: string, payoutInfo: Record<string, unknown>): Promise<AffiliateWithUser>;
  /**
   * Cross-tenant resolution of a user's affiliate memberships via the BYPASSRLS
   * admin pool — the ONE place that reads affiliates without a tenant scope,
   * strictly filtered to `userId`, so the portal can discover which tenants a
   * logged-in user is an affiliate for before any tenant context exists (§6.4).
   */
  adminFindMembershipsByUser(userId: string): Promise<AffiliateWithUser[]>;
}
