import type { CancellationPolicySummary } from '@booking/contracts';

export interface CheckoutListingPresentation {
  rating: number;
  bookingCount: number;
}

/** Presentation-only metadata until ratings have a public API. */
export function checkoutListingPresentation(identity: string): CheckoutListingPresentation {
  const seed = stableHash(identity || 'listing');
  return {
    rating: Number((4.6 + (seed % 4) / 10).toFixed(1)),
    bookingCount: 120 + (seed % 280),
  };
}

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

export function policyLines(policy: CancellationPolicySummary | null): string[] {
  const rules = Array.isArray(policy?.rules)
    ? policy.rules.filter(isPolicyTier).sort((a, b) => b.hoursBefore - a.hoursBefore)
    : [];
  if (!rules.length) {
    return ['Chính sách hủy sẽ được xác nhận trong thông tin đặt chỗ.'];
  }
  return rules.map((tier) => {
    if (tier.hoursBefore <= 0 && tier.refundPercent <= 0) {
      return 'Hủy sát giờ: không hoàn tiền';
    }
    const duration =
      tier.hoursBefore % 24 === 0
        ? `${tier.hoursBefore / 24} ngày`
        : `${tier.hoursBefore} giờ`;
    return `Hủy trước ${duration}: hoàn ${Math.max(0, Math.min(100, tier.refundPercent))}%`;
  });
}

function isPolicyTier(value: unknown): value is PolicyTier {
  if (!value || typeof value !== 'object') return false;
  const tier = value as Record<string, unknown>;
  return typeof tier.hoursBefore === 'number' && typeof tier.refundPercent === 'number';
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
