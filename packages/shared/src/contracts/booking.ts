import { z } from 'zod';
import { uuidSchema } from './common';
import { passwordSchema } from './auth';

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
  /** Optional promotion code entered at checkout (§12.3) — normalised uppercase server-side. */
  promoCode: z.string().min(1).max(50).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const cancelBookingInputSchema = z.object({
  reason: z.string().max(500).optional(),
  /** Email OTP — required for guest (unauthenticated) cancellation. */
  otp: z.string().min(4).max(10).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;

/**
 * Generic optional-reason body shared by the partner reject / no-show / cancel
 * endpoints (§8.2). Replaces the old `markNoShowInputSchema` (kept as an alias
 * for backward compatibility) — the shape is identical.
 */
export const reasonInputSchema = z.object({ reason: z.string().max(500).optional() });
export type ReasonInput = z.infer<typeof reasonInputSchema>;

/** @deprecated Use {@link reasonInputSchema}. Retained so existing importers keep compiling. */
export const markNoShowInputSchema = reasonInputSchema;
export type MarkNoShowInput = ReasonInput;

/**
 * Guest upgrade-to-account (§8.6): a passwordless guest-checkout user sets a
 * password to become a full account. Refused server-side if the email already
 * has a password account.
 */
export const upgradeGuestInputSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
});
export type UpgradeGuestInput = z.infer<typeof upgradeGuestInputSchema>;

/** Partner marks an inventory rental returned + inspected (§9.4). */
export const markReturnedInputSchema = z.object({
  /** Assessed damage in VND đồng deducted from the security deposit (default 0). */
  damageAmount: z.string().regex(/^\d+$/).default('0'),
  reason: z.string().max(500).optional(),
});
export type MarkReturnedInput = z.infer<typeof markReturnedInputSchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const bookingResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: bookingStatusSchema,
  listingId: z.string(),
  resourceId: z.string(),
  partnerId: z.string(),
  bookingMode: z.string(),
  startUtc: z.string(),
  endUtc: z.string(),
  guestCount: z.number(),
  quantity: z.number(),
  /** VND đồng digit strings. */
  totalAmount: z.string(),
  discountAmount: z.string(),
  finalAmount: z.string(),
  depositAmount: z.string(),
  paidAmount: z.string(),
  /** Inventory (§9.4): refundable deposit + fulfillment state. */
  securityDeposit: z.string(),
  pickedUpAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  damageAmount: z.string(),
  customerNote: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

/** Returned when cancelling — includes the computed (not yet executed) refund. */
export const cancelBookingResponseSchema = bookingResponseSchema.extend({
  refundAmount: z.string(),
  refundPercent: z.number(),
});
export type CancelBookingResponse = z.infer<typeof cancelBookingResponseSchema>;

/** Returned when an inventory rental is returned — the deposit settlement (§9.4). */
export const returnBookingResponseSchema = bookingResponseSchema.extend({
  lateFee: z.string(),
  depositRefund: z.string(),
  depositShortfall: z.string(),
});
export type ReturnBookingResponse = z.infer<typeof returnBookingResponseSchema>;

/** OTP issuance — `devOtp` is only populated outside production for testing. */
export const bookingOtpResponseSchema = z.object({
  code: z.string(),
  expiresInSec: z.number(),
  devOtp: z.string().optional(),
});
export type BookingOtpResponse = z.infer<typeof bookingOtpResponseSchema>;

/**
 * Wire shape of the partner master-calendar feed (`GET /partner/bookings`, Task
 * 1.14). Amounts are VND đồng digit strings; instants are UTC ISO strings.
 */
export const partnerCalendarBookingResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: bookingStatusSchema,
  listingId: z.string(),
  listingTitle: z.string(),
  listingTypeId: z.string(),
  listingTypeName: z.string(),
  resourceId: z.string(),
  bookingMode: z.string(),
  startUtc: z.string(),
  endUtc: z.string(),
  guestCount: z.number(),
  quantity: z.number(),
  finalAmount: z.string(),
  /** Inventory (§9.4) fulfillment state — drives the partner pick-up/return actions. */
  securityDeposit: z.string(),
  pickedUpAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
});
export type PartnerCalendarBookingResponse = z.infer<typeof partnerCalendarBookingResponseSchema>;
