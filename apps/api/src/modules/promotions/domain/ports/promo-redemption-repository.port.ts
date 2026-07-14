import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PROMO_REDEMPTION_REPOSITORY = Symbol('PROMO_REDEMPTION_REPOSITORY');

export type PromoRedemptionStatus = 'reserved' | 'applied' | 'released';

export interface CreateRedemptionData {
  promotionId: string;
  bookingId: string;
  customerId: string;
  discountAmount: bigint;
}

export interface RedemptionUsageStats {
  reservedCount: number;
  appliedCount: number;
  releasedCount: number;
  /** Sum of discount across non-released redemptions. */
  totalDiscount: bigint;
}

export interface IPromoRedemptionRepository {
  /** Insert a `reserved` redemption (1:1 with the booking). */
  reserve(tx: PrismaTx, tenantId: string, data: CreateRedemptionData): Promise<void>;
  /** `reserved → applied` for a booking (idempotent). Returns true when it flipped a row. */
  markApplied(tx: PrismaTx, bookingId: string): Promise<boolean>;
  /**
   * `reserved|applied → released` for a booking (idempotent, at-least-once safe).
   * Returns the freed promotion id, or null if nothing was released.
   */
  release(tx: PrismaTx, bookingId: string): Promise<string | null>;
  usageStats(tx: PrismaTx, promotionId: string): Promise<RedemptionUsageStats>;
  /**
   * Count a customer's active (non-`released`) redemptions of a promotion, for the
   * per-customer limit (§12.3). Must run inside the reservation tx so two tabs
   * cannot both slip past the cap.
   */
  countActiveByCustomer(tx: PrismaTx, promotionId: string, customerId: string): Promise<number>;
}
