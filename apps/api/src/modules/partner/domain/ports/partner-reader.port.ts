import type { PartnerStatus, PartnerType, PartnerVerificationStatus } from '@booking/contracts';

import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_READER = Symbol('PARTNER_READER');

/**
 * The partner's owning user — the applicant, who `applyAsPartner` makes the first
 * `PartnerMember` and grants the Partner Owner role. Null for a house partner
 * (created by a tenant admin, no member).
 */
export interface PartnerOwnerRecord {
  email: string;
  phone: string | null;
}

export interface PartnerRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  partnerType: PartnerType;
  isHouse: boolean;
  status: PartnerStatus;
  verificationStatus: PartnerVerificationStatus;
  verifiedAt: Date | null;
  dateOfBirth: Date | null;
  payoutInfo: Record<string, unknown>;
  businessInfo: Record<string, unknown>;
  contactInfo: Record<string, unknown>;
  identityInfo: Record<string, unknown>;
  /** Partner-level fallback cancellation policy (§11.3); null = fall back to the tenant default. */
  defaultCancellationPolicyId: string | null;
  owner: PartnerOwnerRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListPartnersFilter {
  status?: PartnerStatus;
  /** Case-insensitive search over partner name/slug. Applied to items + counts. */
  q?: string;
  page: number;
  pageSize: number;
}

/**
 * Fat partner projections stay on the read side. Tenant-scoped methods receive a
 * `forTenant` tx; `tenantIdOfPartner` deliberately resolves scope on the admin
 * pool before a partner-profile request can open its tenant transaction.
 */
export interface IPartnerReader {
  findById(tx: PrismaTx, id: string): Promise<PartnerRecord | null>;

  list(
    tx: PrismaTx,
    filter: ListPartnersFilter,
  ): Promise<{
    items: PartnerRecord[];
    total: number;
    counts: Record<string, number>;
  }>;

  tenantIdOfPartner(partnerId: string): Promise<string | null>;
}
