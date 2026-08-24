import { RefundAmountExceedsPayment } from './errors/refund-errors';

export interface RefundableSource {
  paymentId: string;
  availableAmount: bigint;
}

export interface RefundAllocation {
  paymentId: string;
  amount: bigint;
}

/** Allocate a business refund deterministically from newest successful captures first. */
export function allocateRefundNewestFirst(
  requestedAmount: bigint,
  sourcesNewestFirst: readonly RefundableSource[],
): RefundAllocation[] {
  if (requestedAmount <= 0n) return [];

  let remaining = requestedAmount;
  const allocations: RefundAllocation[] = [];
  for (const source of sourcesNewestFirst) {
    if (remaining <= 0n) break;
    if (source.availableAmount <= 0n) continue;
    const amount = source.availableAmount < remaining ? source.availableAmount : remaining;
    allocations.push({ paymentId: source.paymentId, amount });
    remaining -= amount;
  }

  if (remaining > 0n) throw new RefundAmountExceedsPayment();
  return allocations;
}
