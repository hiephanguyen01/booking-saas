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

// NOTE: server-only helpers live in `app/lib/booking.server.ts` and must be
// imported directly from there by loaders/actions — re-exporting them through a
// client-reachable feature barrel pulls server code into the client bundle
// (React Router: "Server-only module referenced by client"). Types are safe:
export type { ApiResult } from '../../lib/booking.server';
