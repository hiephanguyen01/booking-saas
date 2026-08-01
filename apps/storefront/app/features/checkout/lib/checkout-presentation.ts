import type { CancellationPolicySummary } from '@booking/contracts';
import { cancellationPolicyLines, type CancellationPolicyLine } from '~/lib/cancellation-policy';

/** One non-stacking checkout promotion selected server-side for presentation. */
export type CheckoutPromotionPresentation =
  | {
      kind: 'code';
      label: string;
      discountAmount: string;
      finalAmount: string;
    }
  | {
      kind: 'auto';
      label: string;
    };

export function checkoutAmounts(
  quote: { subtotal: string; depositAmount: string; securityDeposit: string },
  promotion?: Extract<CheckoutPromotionPresentation, { kind: 'code' }> | null,
) {
  const subtotal = BigInt(quote.subtotal);
  const deposit = BigInt(quote.depositAmount);
  const securityDeposit = BigInt(quote.securityDeposit);
  const finalAmount = BigInt(promotion?.finalAmount ?? quote.subtotal);
  const adjustedDeposit =
    promotion && subtotal > 0n ? (finalAmount * deposit + subtotal / 2n) / subtotal : deposit;

  return {
    subtotal: quote.subtotal,
    discount: promotion?.discountAmount ?? '0',
    finalAmount: finalAmount.toString(),
    deposit: adjustedDeposit.toString(),
    dueNow: (adjustedDeposit + securityDeposit).toString(),
  };
}

/**
 * Cancellation lines for the listing's policy, previewed against the slot the customer
 * is about to book (`startUtc`) and the deposit they're about to pay (`depositAmount`).
 * Returns `null` when the listing has no configured policy — the caller renders the
 * "will be confirmed with your booking" copy for that case.
 */
export function checkoutCancellationLines(
  policy: CancellationPolicySummary | null,
  startUtc: string,
  depositAmount: string,
): CancellationPolicyLine[] | null {
  if (!policy?.rules?.length) return null;
  return cancellationPolicyLines({ startUtc, depositAmount, tiers: policy.rules });
}
