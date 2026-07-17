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
