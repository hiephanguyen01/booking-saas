/**
 * booking feature — public API
 *
 * Co-locates all booking, payment, and OTP logic.
 * The routes (`routes/bookings.tsx`, `routes/booking-detail.tsx`) import from here.
 *
 * Future structure when this grows:
 *   booking/
 *     api/          # fetchBookingByCode, requestBookingOtp, etc.
 *     components/   # BookingCard, OtpModal, etc.
 *     hooks/        # useBookingStatus
 *     loader.ts
 *     action.ts
 *     index.ts
 */

export {
  fetchBookingByCode,
  requestBookingOtp,
  cancelBooking,
  fetchPaymentStatus,
  mockPay,
  mockPaymentsEnabled,
  createBooking,
  checkoutBooking,
  validatePromo,
  fetchAvailability,
} from '../../lib/booking.server';

export type { ApiResult } from '../../lib/booking.server';
