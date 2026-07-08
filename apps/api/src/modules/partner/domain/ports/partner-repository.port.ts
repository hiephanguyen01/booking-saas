import type { PartnerStatus, PartnerType, PartnerVerificationStatus } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_REPOSITORY = Symbol('PARTNER_REPOSITORY');

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
  createdAt: Date;
}

export interface CreatePartnerData {
  name: string;
  slug: string;
  description?: string | null;
  partnerType: PartnerType;
  isHouse?: boolean;
  status?: PartnerStatus;
  businessInfo?: Record<string, unknown>;
  contactInfo?: Record<string, unknown>;
}

export interface UpdatePartnerData {
  status?: PartnerStatus;
  verificationStatus?: PartnerVerificationStatus;
  verifiedAt?: Date | null;
  dateOfBirth?: Date | null;
  payoutInfo?: Record<string, unknown>;
  identityInfo?: Record<string, unknown>;
}

export interface ListPartnersFilter {
  status?: PartnerStatus;
  page: number;
  pageSize: number;
}

/**
 * Partner data is tenant-scoped (RLS): every method takes the `forTenant` tx so
 * the `app.tenant_id` GUC applies. `tenantIdOfPartner` is the one exception — a
 * partner-scoped route has a partnerId but no tenant context, so it resolves the
 * tenant on the admin pool before opening the tenant transaction.
 */
export interface IPartnerRepository {
  create(tx: PrismaTx, tenantId: string, data: CreatePartnerData): Promise<PartnerRecord>;
  findById(tx: PrismaTx, id: string): Promise<PartnerRecord | null>;
  findBySlug(tx: PrismaTx, slug: string): Promise<PartnerRecord | null>;
  list(tx: PrismaTx, filter: ListPartnersFilter): Promise<{ items: PartnerRecord[]; total: number }>;
  update(tx: PrismaTx, id: string, data: UpdatePartnerData): Promise<PartnerRecord>;
  addMember(tx: PrismaTx, params: { tenantId: string; partnerId: string; userId: string }): Promise<void>;
  assignRole(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleId: string },
  ): Promise<void>;
  countActiveBookings(tx: PrismaTx, partnerId: string): Promise<number>;
  tenantIdOfPartner(partnerId: string): Promise<string | null>;
}
