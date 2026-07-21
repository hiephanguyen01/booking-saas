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

/** A commission joined with the booking it came from, for reporting tables. */
export interface AffiliateCommissionWithBooking extends AffiliateCommissionRecord {
  bookingCode: string | null;
  /** The booking's lifecycle state — explains why a commission is pending/reversed. */
  bookingStatus: BookingLifecycleStatus | null;
  /** The booking's `final_amount` (what the customer paid), VND đồng. */
  bookingTotal: bigint | null;
  listingTitle: string | null;
  /** When the commission settled; null until `status === 'paid'`. */
  paidAt: Date | null;
}

/** Mirrors `BookingStatus` in the Prisma schema / `bookingStatusSchema` in the contracts. */
export type BookingLifecycleStatus =
  | 'draft'
  | 'pending_approval'
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'rejected'
  | 'expired'
  | 'refunded';

/** Aggregated commission totals per status for the affiliate dashboard (§15.3). */
export interface AffiliateCommissionTotals {
  pending: bigint;
  confirmed: bigint;
  paid: bigint;
  /** Voided before completion (booking cancelled/rejected/expired) — never payable. */
  reversed: bigint;
  /** Taken back after a post-completion dispute/refund (§7.8). */
  clawedBack: bigint;
  /** Number of distinct bookings that produced a (non-reversed) commission. */
  bookings: number;
}

/** Filters for the paginated affiliate-commission list (§15.3). */
export interface AffiliateCommissionListFilter {
  page: number;
  pageSize: number;
  /** Case-insensitive search over the booking's referral code + booking code. */
  q?: string;
  status?: AffiliateCommissionStatus;
  /** Created-at range (inclusive ISO instants). */
  from?: string;
  to?: string;
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
  /** One page of an affiliate's commissions (newest first) + the matching total. */
  listByAffiliatePaginated(
    tx: PrismaTx,
    affiliateId: string,
    params: AffiliateCommissionListFilter,
  ): Promise<{ items: AffiliateCommissionWithBooking[]; total: number }>;
  totalsForAffiliate(tx: PrismaTx, affiliateId: string): Promise<AffiliateCommissionTotals>;
  /** Flip an affiliate's `confirmed` commissions to `paid` after a payout settles. */
  markConfirmedPaid(tx: PrismaTx, affiliateId: string): Promise<void>;
}
