import type { PromotionSpec } from './promotion-discount';

/**
 * Pure helpers + transport shapes for applying a promotion to a booking (§12.3).
 * No framework / Prisma imports — shared by the prepare/reserve use-cases and by
 * the booking module, which stores the snapshot on the booking row.
 */

/** Immutable snapshot stored on the booking (§12.5 — editing the program later cannot alter it). */
export interface PromotionSnapshot {
  promotionId: string;
  code: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  fundedBy: 'tenant' | 'partner';
  discountAmount: string;
}

export interface PreparedPromotion {
  promotionId: string;
  /** The applied code, or null for an auto-campaign. */
  promoCode: string | null;
  discountAmount: bigint;
  finalAmount: bigint;
  usageLimitPerCustomer: number | null;
  snapshot: PromotionSnapshot;
}

export interface PreparePromotionParams {
  /** A customer-entered code (wins over auto-campaigns). Omitted/null → auto-campaign path. */
  code?: string | null;
  listingId: string;
  amount: bigint;
  slotStart: Date | null;
  customerId: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function snapshotOf(promo: PromotionSpec, discountAmount: bigint): PromotionSnapshot {
  return {
    promotionId: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue.toString(),
    fundedBy: promo.fundedBy,
    discountAmount: discountAmount.toString(),
  };
}
