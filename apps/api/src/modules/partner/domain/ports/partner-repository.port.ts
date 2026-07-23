import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  PartnerBusinessInfoIntent,
  PartnerDefaultCancellationPolicyIntent,
  PartnerIdentityRejectionIntent,
  PartnerIdentitySubmissionIntent,
  PartnerIdentityVerifiedIntent,
  NewPartner,
  PartnerPayoutIntent,
  PartnerState,
  PartnerStatusIntent,
} from '../entities/partner.entity';
import type { PartnerRecord } from './partner-reader.port';

export type { ListPartnersFilter, PartnerOwnerRecord, PartnerRecord } from './partner-reader.port';

export const PARTNER_REPOSITORY = Symbol('PARTNER_REPOSITORY');

export interface IPartnerRepository {
  create(tx: PrismaTx, partner: NewPartner): Promise<PartnerRecord>;

  /**
   * Cross-module compatibility seam for Listing. Keep the enriched projection
   * and exact signature until Listing owns a narrower reader port.
   */
  findById(tx: PrismaTx, id: string): Promise<PartnerRecord | null>;

  findStateById(tx: PrismaTx, id: string): Promise<PartnerState | null>;
  findByIdForUpdate(tx: PrismaTx, id: string): Promise<PartnerState | null>;
  findBySlug(tx: PrismaTx, slug: string): Promise<PartnerState | null>;

  updateStatus(tx: PrismaTx, id: string, intent: PartnerStatusIntent): Promise<PartnerRecord>;

  updateIdentitySubmission(
    tx: PrismaTx,
    id: string,
    intent: PartnerIdentitySubmissionIntent,
  ): Promise<PartnerRecord>;

  updateIdentityReview(
    tx: PrismaTx,
    id: string,
    intent: PartnerIdentityRejectionIntent | PartnerIdentityVerifiedIntent,
  ): Promise<PartnerRecord>;

  updatePayoutInfo(tx: PrismaTx, id: string, intent: PartnerPayoutIntent): Promise<PartnerRecord>;

  updateBusinessInfo(
    tx: PrismaTx,
    id: string,
    intent: PartnerBusinessInfoIntent,
  ): Promise<PartnerRecord>;

  updateDefaultCancellationPolicy(
    tx: PrismaTx,
    id: string,
    intent: PartnerDefaultCancellationPolicyIntent,
  ): Promise<PartnerRecord>;

  isCancellationPolicyVisible(tx: PrismaTx, partnerId: string, policyId: string): Promise<boolean>;

  addMember(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string },
  ): Promise<void>;
  assignRole(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleId: string },
  ): Promise<void>;
  countActiveBookings(tx: PrismaTx, partnerId: string): Promise<number>;
}
