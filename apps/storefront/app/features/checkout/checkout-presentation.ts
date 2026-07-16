import type { CancellationPolicySummary } from '@booking/contracts';

export function checkoutAmounts(
  quote: { subtotal: string; depositAmount: string; securityDeposit: string },
  promo?: { discountAmount: string; finalAmount: string } | null,
) {
  const subtotal = BigInt(quote.subtotal);
  const deposit = BigInt(quote.depositAmount);
  const securityDeposit = BigInt(quote.securityDeposit);
  const finalAmount = BigInt(promo?.finalAmount ?? quote.subtotal);
  const adjustedDeposit =
    promo && subtotal > 0n
      ? (finalAmount * deposit + subtotal / 2n) / subtotal
      : deposit;

  return {
    subtotal: quote.subtotal,
    discount: promo?.discountAmount ?? '0',
    finalAmount: finalAmount.toString(),
    dueNow: (adjustedDeposit + securityDeposit).toString(),
  };
}

interface PolicyTier {
  hoursBefore: number;
  refundPercent: number;
}

/**
 * A cancellation tier reduced to the shape its sentence needs. The wording stays
 * in `@booking/i18n` so `/en` renders English — this module must not decide copy.
 */
export type PolicyLine =
  | { kind: 'unspecified' }
  | { kind: 'noRefund' }
  | { kind: 'refund'; unit: 'day' | 'hour'; amount: number; refundPercent: number };

export function policyLines(policy: CancellationPolicySummary | null): PolicyLine[] {
  const rules = Array.isArray(policy?.rules)
    ? policy.rules.filter(isPolicyTier).sort((a, b) => b.hoursBefore - a.hoursBefore)
    : [];
  if (!rules.length) return [{ kind: 'unspecified' }];
  return rules.map((tier) => {
    if (tier.hoursBefore <= 0 && tier.refundPercent <= 0) return { kind: 'noRefund' };
    const refundPercent = Math.max(0, Math.min(100, tier.refundPercent));
    return tier.hoursBefore % 24 === 0
      ? { kind: 'refund', unit: 'day', amount: tier.hoursBefore / 24, refundPercent }
      : { kind: 'refund', unit: 'hour', amount: tier.hoursBefore, refundPercent };
  });
}

function isPolicyTier(value: unknown): value is PolicyTier {
  if (!value || typeof value !== 'object') return false;
  const tier = value as Record<string, unknown>;
  return typeof tier.hoursBefore === 'number' && typeof tier.refundPercent === 'number';
}
