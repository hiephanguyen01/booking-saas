import { z } from 'zod';
import { uuidSchema } from './common';

/** Booking state machine (§8). Terminal-ish branches: completed/no_show/rejected/expired/refunded. */
export const bookingStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'rejected',
  'expired',
  'refunded',
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

/** Booking-core covers the exclusive-calendar modes; inventory is Task 1.8. */
export const bookableModeSchema = z.enum(['hourly', 'daily']);
export type BookableMode = z.infer<typeof bookableModeSchema>;

/** Guest checkout (§8.6): no account, just contact info. */
export const guestInfoSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(5).max(20),
});
export type GuestInfo = z.infer<typeof guestInfoSchema>;

export const createBookingInputSchema = z.object({
  listingId: uuidSchema,
  mode: bookableModeSchema,
  /** UTC ISO instants for the requested slot. */
  from: z.string().datetime(),
  to: z.string().datetime(),
  guestCount: z.number().int().positive().max(1000).default(1),
  customerNote: z.string().max(1000).optional(),
  /** Required when the caller is not a logged-in customer. */
  guest: guestInfoSchema.optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const cancelBookingInputSchema = z.object({
  reason: z.string().max(500).optional(),
  /** Email OTP — required for guest (unauthenticated) cancellation. */
  otp: z.string().min(4).max(10).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;

export const markNoShowInputSchema = z.object({ reason: z.string().max(500).optional() });
export type MarkNoShowInput = z.infer<typeof markNoShowInputSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export interface BookingResponse {
  id: string;
  code: string;
  status: BookingStatus;
  listingId: string;
  resourceId: string;
  partnerId: string;
  bookingMode: string;
  startUtc: string;
  endUtc: string;
  guestCount: number;
  quantity: number;
  /** VND đồng digit strings. */
  totalAmount: string;
  discountAmount: string;
  finalAmount: string;
  depositAmount: string;
  paidAmount: string;
  customerNote: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Returned when cancelling — includes the computed (not yet executed) refund. */
export interface CancelBookingResponse extends BookingResponse {
  refundAmount: string;
  refundPercent: number;
}

/** OTP issuance — `devOtp` is only populated outside production for testing. */
export interface BookingOtpResponse {
  code: string;
  expiresInSec: number;
  devOtp?: string;
}
