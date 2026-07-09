import type { PaymentStatus } from '@prisma/client';

/**
 * Payment status is a one-way machine (§11.2): `succeeded` is terminal, and a
 * later out-of-order `failed`/`expired` is ignored. The webhook must also match
 * the paid amount against the expected amount — an underpayment can't confirm.
 */
export function canSucceed(current: PaymentStatus): boolean {
  return current === 'pending';
}

export function amountMatches(expected: bigint, paid: bigint): boolean {
  return paid >= expected; // an underpayment cannot confirm; overpayment is accepted
}
