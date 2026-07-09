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

/** Bookable modes: exclusive-calendar (hourly/daily) + multi-unit inventory (§9.4). */
export const bookableModeSchema = z.enum(['hourly', 'daily', 'inventory']);
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
  /** Units to rent — `inventory` mode only; ignored (forced to 1) for hourly/daily. */
  quantity: z.number().int().positive().max(1000).default(1),
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

/** Partner marks an inventory rental returned + inspected (§9.4). */
export const markReturnedInputSchema = z.object({
  /** Assessed damage in VND đồng deducted from the security deposit (default 0). */
  damageAmount: z.string().regex(/^\d+$/).default('0'),
  reason: z.string().max(500).optional(),
});
export type MarkReturnedInput = z.infer<typeof markReturnedInputSchema>;

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
  /** Inventory (§9.4): refundable deposit + fulfillment state. */
  securityDeposit: string;
  pickedUpAt: string | null;
  returnedAt: string | null;
  damageAmount: string;
  customerNote: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Returned when cancelling — includes the computed (not yet executed) refund. */
export interface CancelBookingResponse extends BookingResponse {
  refundAmount: string;
  refundPercent: number;
}

/** Returned when an inventory rental is returned — the deposit settlement (§9.4). */
export interface ReturnBookingResponse extends BookingResponse {
  lateFee: string;
  depositRefund: string;
  depositShortfall: string;
}

/** OTP issuance — `devOtp` is only populated outside production for testing. */
export interface BookingOtpResponse {
  code: string;
  expiresInSec: number;
  devOtp?: string;
}
