import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import {
  defaultCommissionSnapshot,
  type CommissionSnapshot,
} from '../../../shared/domain/commission/commission-snapshot';

/** The finance-relevant slice of a booking that the journal use-cases replay from. */
export interface BookingFinanceView {
  id: string;
  partnerId: string;
  affiliateId: string | null;
  totalAmount: bigint;
  finalAmount: bigint;
  paidAmount: bigint;
  additionalCharges: bigint;
  snapshot: CommissionSnapshot;
  fundedBy: 'tenant' | 'partner' | null;
  serviceDate: Date;
}

/**
 * Load a booking's finance view inside the caller's RLS-scoped tx (§13.1). Falls
 * back to a zero-commission snapshot when the booking predates snapshotting, and
 * only honours `promotionSnapshot.fundedBy` when a discount was actually applied.
 */
export async function loadBookingFinanceView(
  tx: PrismaTx,
  bookingId: string,
): Promise<BookingFinanceView | null> {
  const b = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      partnerId: true,
      affiliateId: true,
      totalAmount: true,
      finalAmount: true,
      paidAmount: true,
      additionalCharges: true,
      commissionSnapshot: true,
      promotionSnapshot: true,
      discountAmount: true,
    },
  });
  if (!b) return null;
  const serviceRows = await tx.$queryRaw<{ serviceDate: Date | null }[]>`
    SELECT lower(COALESCE(timeslot, blocked_period)) AS "serviceDate"
    FROM bookings
    WHERE id = ${bookingId}::uuid
  `;
  const serviceDate = serviceRows[0]?.serviceDate;
  if (!serviceDate) throw new Error(`Booking ${bookingId} has no service date`);

  let snapshot = b.commissionSnapshot as CommissionSnapshot | null;
  if (!snapshot) {
    const partner = await tx.partner.findUnique({
      where: { id: b.partnerId },
      select: { isHouse: true },
    });
    snapshot = defaultCommissionSnapshot(partner?.isHouse ?? false);
  }
  const promo = b.promotionSnapshot as { fundedBy?: 'tenant' | 'partner' } | null;
  const fundedBy = b.discountAmount > 0n ? (promo?.fundedBy ?? null) : null;

  return {
    id: b.id,
    partnerId: b.partnerId,
    affiliateId: b.affiliateId,
    totalAmount: b.totalAmount,
    finalAmount: b.finalAmount,
    paidAmount: b.paidAmount,
    additionalCharges: sumCharges(b.additionalCharges),
    snapshot,
    fundedBy,
    serviceDate,
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
