import type { PaymentStatus } from '@prisma/client';
import type { PaymentStatusResponse } from '@booking/contracts';

/**
 * Fixed checkout amounts settle only on an exact provider capture. Underpayment
 * and overpayment are both quarantined for review; neither may confirm a booking.
 */
export function amountMatches(expected: bigint, paid: bigint): boolean {
  return paid === expected;
}

/** Keep the public payment state aligned with the latest gateway attempt. */
export function publicPaymentStatus(
  status: PaymentStatus | null,
): PaymentStatusResponse['paymentStatus'] {
  return status ?? 'none';
}
