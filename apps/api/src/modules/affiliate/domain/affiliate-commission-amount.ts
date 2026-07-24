import type { Vnd } from '../../../shared/money/money';
import { computeCommissionSplit } from '../../finance/domain/commission-split';
import { snapshotToRates, type CommissionSnapshot } from '../../finance/domain/commission-snapshot';

/**
 * The affiliate commission for a booking, replayed from the SAME frozen
 * `commission_snapshot` the finance ledger uses (§13.1). Reusing the finance
 * split maths — rather than re-deriving a rate — guarantees the amount tracked in
 * `affiliate_commissions` equals the `affiliate_commission` ledger leg exactly, so
 * the ledger stays balanced and the affiliate's payable never drifts.
 *
 * The affiliate's `custom_rate` (§15.2) is applied by baking it into the snapshot
 * at booking time (see `applyCustomRate` in `affiliate-rate.ts`), so it is
 * already reflected here with no special-casing.
 */
export interface AffiliateAmountInput {
  snapshot: CommissionSnapshot;
  /** Pre-discount price (§7.5). */
  totalAmount: Vnd;
  /** What the customer pays = total − discount. */
  finalAmount: Vnd;
  /** Extra charges added before completion (§8.3); 0 at confirmation time. */
  additionalCharges: Vnd;
  /** `tenant` when a tenant-funded promo shifts the partner basis (§12.4). */
  fundedBy: 'tenant' | 'partner' | null;
}

/**
 * Promo funding affects the ledger basis only when a discount was actually
 * applied. Keep the stored json projection tolerant and preserve its current
 * null fallback.
 */
export function resolveAffiliateFundedBy(
  discountAmount: Vnd,
  promotionSnapshot: unknown,
): 'tenant' | 'partner' | null {
  const promotion = promotionSnapshot as {
    fundedBy?: 'tenant' | 'partner';
  } | null;
  return discountAmount > 0n ? (promotion?.fundedBy ?? null) : null;
}

/**
 * Sum additional-charge amounts from legacy json. Safe integer numbers, signed
 * digit strings, and bigint values are accepted; everything else is ignored.
 * A non-positive final total is clamped to zero.
 */
export function normalizeAffiliateAdditionalCharges(raw: unknown): Vnd {
  if (!Array.isArray(raw)) return 0n;
  let total = 0n;
  for (const item of raw) {
    const amount = (item as { amount?: unknown })?.amount;
    if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
      total += BigInt(amount);
    } else if (typeof amount === 'string' && /^-?\d+$/.test(amount)) {
      total += BigInt(amount);
    } else if (typeof amount === 'bigint') {
      total += amount;
    }
  }
  return total > 0n ? total : 0n;
}

export function computeAffiliateCommission(input: AffiliateAmountInput): Vnd {
  const effectiveFinal = input.finalAmount + input.additionalCharges;
  const effectiveTotal = input.totalAmount + input.additionalCharges;
  const split = computeCommissionSplit({
    totalAmount: effectiveTotal,
    finalAmount: effectiveFinal,
    fundedBy: input.fundedBy,
    hasAffiliate: true,
    rates: snapshotToRates(input.snapshot),
  });
  return split.affiliateCommission;
}
