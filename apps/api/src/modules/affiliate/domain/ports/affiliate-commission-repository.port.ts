import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AFFILIATE_COMMISSION_REPOSITORY = Symbol('AFFILIATE_COMMISSION_REPOSITORY');

export type AffiliateCommissionStatus = 'pending' | 'confirmed' | 'paid' | 'reversed' | 'clawed_back';

export interface AffiliateCommissionRecord {
  id: string;
  tenantId: string;
  affiliateId: string;
  bookingId: string;
  amount: bigint;
  status: AffiliateCommissionStatus;
  createdAt: Date;
}

/** A commission joined with its booking code, for reporting tables. */
export interface AffiliateCommissionWithBooking extends AffiliateCommissionRecord {
  bookingCode: string | null;
}

/** Aggregated commission totals per status for the affiliate dashboard (§15.3). */
export interface AffiliateCommissionTotals {
  pending: bigint;
  confirmed: bigint;
  paid: bigint;
  /** Number of distinct bookings that produced a (non-reversed) commission. */
  bookings: number;
}

export interface IAffiliateCommissionRepository {
  findByBooking(tx: PrismaTx, bookingId: string): Promise<AffiliateCommissionRecord | null>;
  /** Insert-or-update the single row keyed by the unique `booking_id`. */
  upsert(
    tx: PrismaTx,
    tenantId: string,
    data: { affiliateId: string; bookingId: string; amount: bigint; status: AffiliateCommissionStatus },
  ): Promise<void>;
  /** Update status (+ optionally amount) for a booking's commission. */
  updateForBooking(
    tx: PrismaTx,
    bookingId: string,
    data: { status: AffiliateCommissionStatus; amount?: bigint },
  ): Promise<void>;
  listByAffiliate(tx: PrismaTx, affiliateId: string): Promise<AffiliateCommissionWithBooking[]>;
  totalsForAffiliate(tx: PrismaTx, affiliateId: string): Promise<AffiliateCommissionTotals>;
  /** Flip an affiliate's `confirmed` commissions to `paid` after a payout settles. */
  markConfirmedPaid(tx: PrismaTx, affiliateId: string): Promise<void>;
}
