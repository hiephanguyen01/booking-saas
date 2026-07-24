import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { defaultCommissionSnapshot, type CommissionSnapshot } from '../../finance/domain/commission-snapshot';
import {
  normalizeAffiliateAdditionalCharges,
  resolveAffiliateFundedBy,
} from '../domain/affiliate-commission-amount';

export interface BookingFinanceView {
  affiliateId: string;
  totalAmount: bigint;
  finalAmount: bigint;
  additionalCharges: bigint;
  snapshot: CommissionSnapshot;
  fundedBy: 'tenant' | 'partner' | null;
}

/**
 * The finance-relevant slice of a booking for the commission lifecycle use-cases
 * (§7.8): the frozen `commission_snapshot` (defaulted when absent), amounts, and
 * promo funding. Returns `null` when the booking is missing or carries no
 * affiliate attribution. Plain function — shared by the record-* use-cases, runs
 * on their RLS-scoped `tx`.
 */
export async function loadBookingFinanceView(
  tx: PrismaTx,
  bookingId: string,
): Promise<BookingFinanceView | null> {
  const b = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      affiliateId: true,
      partnerId: true,
      totalAmount: true,
      finalAmount: true,
      additionalCharges: true,
      commissionSnapshot: true,
      promotionSnapshot: true,
      discountAmount: true,
    },
  });
  if (!b || !b.affiliateId) return null;

  let snapshot = b.commissionSnapshot as CommissionSnapshot | null;
  if (!snapshot) {
    const partner = await tx.partner.findUnique({ where: { id: b.partnerId }, select: { isHouse: true } });
    snapshot = defaultCommissionSnapshot(partner?.isHouse ?? false);
  }
  return {
    affiliateId: b.affiliateId,
    totalAmount: b.totalAmount,
    finalAmount: b.finalAmount,
    additionalCharges: normalizeAffiliateAdditionalCharges(
      b.additionalCharges,
    ),
    snapshot,
    fundedBy: resolveAffiliateFundedBy(
      b.discountAmount,
      b.promotionSnapshot,
    ),
  };
}
