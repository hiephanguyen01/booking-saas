import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { LegalDocumentType } from '@booking/contracts';

export const AGREEMENT_ACCEPTANCE_REPOSITORY = Symbol('AGREEMENT_ACCEPTANCE_REPOSITORY');

export type AgreementTypeKey =
  | 'partner_terms'
  | 'commission_schedule'
  | 'promo_funding'
  | 'customer_terms'
  | 'privacy_policy'
  | 'affiliate_terms';

export interface RecordAcceptanceData {
  tenantId: string;
  /** The person who clicked. Required for every document-backed acceptance. */
  userId: string;
  /** Only when bound to a partner org (partner_terms, commission_schedule, promo_funding). */
  partnerId?: string | null;
  agreementType: AgreementTypeKey;
  /** Null for the two non-document types. */
  documentVersionId?: string | null;
  /** The locale actually rendered, fallback included. */
  acceptedLocale?: string | null;
  /** version_no as text for documents; the promotion uuid for promo_funding. */
  version: string;
  ip?: string | null;
}

export interface AcceptanceRow {
  agreementType: AgreementTypeKey;
  version: string;
  documentVersionId: string | null;
  acceptedLocale: string | null;
  acceptedAt: Date;
}

export interface PendingRow {
  docType: LegalDocumentType;
  documentId: string;
  versionId: string;
  versionNo: number;
}

/**
 * Legal-owned seam for every proof-of-acceptance row. `partnerId` is optional
 * here — a customer or affiliate acceptance has no partner — which is exactly
 * what partner's deleted AGREEMENT_REPOSITORY could not express.
 */
export interface IAgreementAcceptanceRepository {
  record(tx: PrismaTx, data: RecordAcceptanceData): Promise<void>;
  pendingTypes(
    tx: PrismaTx,
    userId: string,
    types: readonly LegalDocumentType[],
    partnerId?: string | null,
  ): Promise<PendingRow[]>;
  listByUser(tx: PrismaTx, userId: string): Promise<AcceptanceRow[]>;
  listByPartner(tx: PrismaTx, partnerId: string): Promise<AcceptanceRow[]>;
}
