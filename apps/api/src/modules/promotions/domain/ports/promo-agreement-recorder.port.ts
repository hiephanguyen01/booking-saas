import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PROMO_AGREEMENT_RECORDER = Symbol('PROMO_AGREEMENT_RECORDER');

export interface PromoFundingAgreement {
  tenantId: string;
  partnerId: string;
  userId: string;
  promotionId: string;
  ip: string | null;
}

/**
 * Promotions-owned persistence seam for the proof that a partner accepted one
 * specific partner-funded campaign. Keeping this port here prevents the
 * promotions application layer from importing partner internals while retaining
 * the original one-transaction opt-in + proof write.
 */
export interface IPromoAgreementRecorder {
  record(tx: PrismaTx, agreement: PromoFundingAgreement): Promise<void>;
}
