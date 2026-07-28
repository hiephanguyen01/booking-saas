import {
  bookingStatusSchema,
  type BookingStatus,
  type PaymentStatusResponse,
} from '@booking/contracts';

const PENDING = new Set<BookingStatus>(['pending_payment', 'pending_approval', 'draft']);
const SUCCESS = new Set<BookingStatus>(['confirmed', 'completed']);

export interface BookingPaymentState {
  bookingStatus: BookingStatus | null;
  paymentFailed: boolean;
  isSuccess: boolean;
  isPending: boolean;
  shouldPoll: boolean;
}

/** `PaymentStatusResponse.bookingStatus` is wire-typed as a plain string (§11.2). */
function normalizeBookingStatus(value: string): BookingStatus | null {
  const parsed = bookingStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function deriveBookingPaymentState(
  status: PaymentStatusResponse,
  searchParams: URLSearchParams,
): BookingPaymentState {
  const bookingStatus = normalizeBookingStatus(status.bookingStatus);
  const paymentOutcome = searchParams.get('payment');
  const isSuccess =
    status.paymentStatus === 'succeeded' || (bookingStatus !== null && SUCCESS.has(bookingStatus));
  const serverFailed =
    status.paymentStatus === 'failed' ||
    status.paymentStatus === 'expired' ||
    bookingStatus === 'expired' ||
    bookingStatus === 'rejected';
  const redirectFailed =
    paymentOutcome === 'cancel' ||
    paymentOutcome === 'error' ||
    // Backward compatibility for checkout links created before the SePay redirect normalization.
    searchParams.get('cancelled') === '1';
  const paymentFailed = !isSuccess && (serverFailed || redirectFailed);
  const isPending =
    !paymentFailed && !isSuccess && bookingStatus !== null && PENDING.has(bookingStatus);
  const shouldPoll =
    !isSuccess && !serverFailed && bookingStatus !== null && PENDING.has(bookingStatus);

  return { bookingStatus, paymentFailed, isSuccess, isPending, shouldPoll };
}
