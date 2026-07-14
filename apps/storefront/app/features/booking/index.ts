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

// Server-only helpers and their request result types live in
// `app/lib/booking.server.ts`; loaders/actions import them directly so this
// browser-reachable barrel never points at a server module.
