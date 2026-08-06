/**
 * Form bounds and error-code vocabulary for the customer dispute flow.
 *
 * The lengths mirror `openSettlementDisputeInputSchema` so the dialog refuses
 * what the backend would refuse anyway, and the codes are the machine `code`
 * the API envelope carries — never the English `message`, which is not
 * translatable.
 */
export const DISPUTE_REASON_MIN = 10;
export const DISPUTE_REASON_MAX = 2000;
export const DISPUTE_EVIDENCE_MAX = 5000;

const DISPUTE_ERROR_KEYS = {
  DISPUTE_REASON_REQUIRED: 'bookings.disputeErrors.reasonRequired',
  DISPUTE_INVALID: 'bookings.disputeErrors.invalid',
  DISPUTE_WINDOW_CLOSED: 'bookings.disputeErrors.windowClosed',
  DISPUTE_ALREADY_RESOLVED: 'bookings.disputeErrors.alreadyResolved',
  SETTLEMENT_NOT_FOUND: 'bookings.disputeErrors.settlementNotFound',
  BOOKING_NOT_FOUND: 'bookings.disputeErrors.bookingNotFound',
  DISPUTE_FAILED: 'bookings.disputeErrors.failed',
} as const;

export type BookingActionErrorKey =
  (typeof DISPUTE_ERROR_KEYS)[keyof typeof DISPUTE_ERROR_KEYS] | 'bookings.actionFailed';

/** Anything outside the dispute vocabulary keeps the generic action message. */
export function bookingActionErrorKey(code: string | null | undefined): BookingActionErrorKey {
  if (!code) return 'bookings.actionFailed';
  return DISPUTE_ERROR_KEYS[code as keyof typeof DISPUTE_ERROR_KEYS] ?? 'bookings.actionFailed';
}
