import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AGREEMENT_REPOSITORY = Symbol('AGREEMENT_REPOSITORY');

export type AgreementTypeKey = 'partner_terms' | 'commission_schedule' | 'promo_funding';

export interface RecordAgreementData {
  tenantId: string;
  partnerId: string;
  userId?: string | null;
  agreementType: AgreementTypeKey;
  version: string;
  ip?: string | null;
}

/** Proof-of-acceptance for partner terms / commission schedules (§7.2). */
export interface IAgreementRepository {
  record(tx: PrismaTx, data: RecordAgreementData): Promise<void>;
}
