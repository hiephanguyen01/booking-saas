import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCommissionState,
  AffiliateCommissionStatus,
} from '../entities/affiliate-commission.entity';

export const AFFILIATE_COMMISSION_READER = Symbol(
  'AFFILIATE_COMMISSION_READER',
);

/** Base commission response shape without booking joins. */
export type AffiliateCommissionRecord = AffiliateCommissionState;

/** A commission joined with the booking it came from, for reporting tables. */
export interface AffiliateCommissionWithBooking
  extends AffiliateCommissionRecord {
  bookingCode: string | null;
  /** The booking lifecycle state explaining pending/reversed commission. */
  bookingStatus: BookingLifecycleStatus | null;
  /** The booking's `final_amount` (what the customer paid), VND đồng. */
  bookingTotal: bigint | null;
  listingTitle: string | null;
  /** Derived from `updatedAt` only while status is `paid`. */
  paidAt: Date | null;
}

/** Mirrors BookingStatus in Prisma and bookingStatusSchema in contracts. */
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
  /** Voided before completion — never payable. */
  reversed: bigint;
  /** Taken back after a post-completion dispute/refund. */
  clawedBack: bigint;
  /** Distinct bookings with a live, non-reversed commission. */
  bookings: number;
}

/** Filters for the paginated affiliate-commission list (§15.3). */
export interface AffiliateCommissionListFilter {
  page: number;
  pageSize: number;
  /** Case-insensitive search over booking referral code + booking code. */
  q?: string;
  status?: AffiliateCommissionStatus;
  /** Created-at range (inclusive ISO instants). */
  from?: string;
  to?: string;
}

export interface IAffiliateCommissionReader {
  listByAffiliate(
    tx: PrismaTx,
    affiliateId: string,
  ): Promise<AffiliateCommissionWithBooking[]>;
  /** One page of commissions (newest first) + matching total. */
  listByAffiliatePaginated(
    tx: PrismaTx,
    affiliateId: string,
    params: AffiliateCommissionListFilter,
  ): Promise<{
    items: AffiliateCommissionWithBooking[];
    total: number;
  }>;
  totalsForAffiliate(
    tx: PrismaTx,
    affiliateId: string,
  ): Promise<AffiliateCommissionTotals>;
}
