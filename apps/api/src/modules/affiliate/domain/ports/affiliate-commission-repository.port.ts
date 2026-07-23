import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCommissionState,
  AffiliateCommissionStatus,
  NewAffiliateCommission,
} from '../entities/affiliate-commission.entity';

export const AFFILIATE_COMMISSION_REPOSITORY = Symbol('AFFILIATE_COMMISSION_REPOSITORY');

export interface AffiliateCommissionUpdate {
  status: AffiliateCommissionStatus;
  amount?: bigint;
}

export interface IAffiliateCommissionRepository {
  loadByBooking(
    tx: PrismaTx,
    bookingId: string,
  ): Promise<AffiliateCommissionState | null>;
  /** Insert-or-update the single row keyed by the unique `booking_id`. */
  upsert(
    tx: PrismaTx,
    commission: NewAffiliateCommission,
  ): Promise<void>;
  /** Update status (+ optionally amount) for a booking's commission. */
  updateForBooking(
    tx: PrismaTx,
    bookingId: string,
    data: AffiliateCommissionUpdate,
  ): Promise<void>;
  /** Flip an affiliate's `confirmed` commissions to `paid` after a payout settles. */
  markConfirmedPaid(tx: PrismaTx, affiliateId: string): Promise<void>;
}
