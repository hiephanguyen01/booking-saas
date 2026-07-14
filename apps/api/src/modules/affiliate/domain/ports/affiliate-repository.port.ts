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

/** An affiliate joined with its user, for tenant-side listing + the portal. */
export interface AffiliateWithUser extends AffiliateRecord {
  userName: string;
  userEmail: string;
  tenantName: string;
}

export interface CreateAffiliateData {
  userId: string;
  payoutInfo: unknown;
}

export interface IAffiliateRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateAffiliateData): Promise<AffiliateRecord>;
  findById(tx: PrismaTx, id: string): Promise<AffiliateRecord | null>;
  findByUser(tx: PrismaTx, userId: string): Promise<AffiliateRecord | null>;
  findByUserWithTenant(tx: PrismaTx, id: string): Promise<AffiliateWithUser | null>;
  list(tx: PrismaTx): Promise<AffiliateWithUser[]>;
  setStatus(tx: PrismaTx, id: string, status: AffiliateStatus): Promise<AffiliateRecord>;
  setCustomRate(tx: PrismaTx, id: string, customRate: bigint | null): Promise<AffiliateRecord>;
  /**
   * Cross-tenant resolution of a user's affiliate memberships via the BYPASSRLS
   * admin pool — the ONE place that reads affiliates without a tenant scope,
   * strictly filtered to `userId`, so the portal can discover which tenants a
   * logged-in user is an affiliate for before any tenant context exists (§6.4).
   */
  adminFindMembershipsByUser(userId: string): Promise<AffiliateWithUser[]>;
}
