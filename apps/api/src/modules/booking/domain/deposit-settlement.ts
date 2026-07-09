import type { Vnd } from '../../../shared/money/money';

/**
 * Security-deposit settlement on return (§9.4). The deposit covers damage + any
 * late fee; the customer gets back the remainder, or owes a shortfall if the
 * charges exceed the deposit. Commission is NEVER charged on the deposit — it is
 * a refundable hold, not revenue. Money movement is executed in Task 1.9.
 */
export interface DepositSettlement {
  refund: Vnd;
  shortfall: Vnd;
}

export function settleDeposit(securityDeposit: Vnd, damage: Vnd, lateFee: Vnd): DepositSettlement {
  const charges = damage + lateFee;
  if (charges >= securityDeposit) {
    return { refund: 0n, shortfall: charges - securityDeposit };
  }
  return { refund: securityDeposit - charges, shortfall: 0n };
}
