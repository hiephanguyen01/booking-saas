import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import { defaultCommissionSnapshot, type CommissionSnapshot } from '../../finance/domain/commission-snapshot';

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
  const promo = b.promotionSnapshot as { fundedBy?: 'tenant' | 'partner' } | null;
  const fundedBy = b.discountAmount > 0n ? (promo?.fundedBy ?? null) : null;

  return {
    affiliateId: b.affiliateId,
    totalAmount: b.totalAmount,
    finalAmount: b.finalAmount,
    additionalCharges: sumCharges(b.additionalCharges),
    snapshot,
    fundedBy,
  };
}

/** Sum the `amount` fields of the additional_charges json array (§8.3). */
function sumCharges(raw: unknown): bigint {
  if (!Array.isArray(raw)) return 0n;
  let total = 0n;
  for (const item of raw) {
    const amount = (item as { amount?: unknown })?.amount;
    if (typeof amount === 'number' && Number.isSafeInteger(amount)) total += BigInt(amount);
    else if (typeof amount === 'string' && /^-?\d+$/.test(amount)) total += BigInt(amount);
    else if (typeof amount === 'bigint') total += amount;
  }
  return total > 0n ? total : 0n;
}
