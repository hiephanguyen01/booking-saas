import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { NewPromoRedemption } from '../entities/promo-redemption.entity';

export const PROMO_REDEMPTION_REPOSITORY = Symbol('PROMO_REDEMPTION_REPOSITORY');

export interface RedemptionUsageStats {
  reservedCount: number;
  appliedCount: number;
  releasedCount: number;
  /** Sum of discount across non-released redemptions. */
  totalDiscount: bigint;
}

export interface IPromoRedemptionRepository {
  /** Insert a `reserved` redemption (1:1 with the booking). */
  reserve(tx: PrismaTx, tenantId: string, redemption: NewPromoRedemption): Promise<void>;
  /** `reserved → applied` for a booking (idempotent). Returns true when it flipped a row. */
  markApplied(tx: PrismaTx, bookingId: string): Promise<boolean>;
  /**
   * `reserved|applied → released` for a booking (idempotent, at-least-once safe).
   * Returns the freed promotion id, or null if nothing was released.
   */
  release(tx: PrismaTx, bookingId: string): Promise<string | null>;
  usageStats(tx: PrismaTx, promotionId: string): Promise<RedemptionUsageStats>;
  /**
   * Serialise reservations of one promotion by one customer for the rest of the
   * transaction, so two concurrent tabs cannot both pass the per-customer cap
   * (§12.3). Must be taken BEFORE {@link countActiveByCustomer} and released by
   * the transaction ending — never call it outside the reservation tx.
   */
  lockPerCustomer(tx: PrismaTx, promotionId: string, customerId: string): Promise<void>;
  /**
   * Count a customer's active (non-`released`) redemptions of a promotion, for the
   * per-customer limit (§12.3). Must run inside the reservation tx so two tabs
   * cannot both slip past the cap.
   */
  countActiveByCustomer(tx: PrismaTx, promotionId: string, customerId: string): Promise<number>;
}
