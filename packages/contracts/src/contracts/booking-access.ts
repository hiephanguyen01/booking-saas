import { z } from 'zod';
import { bookingResponseSchema } from './booking';

/** Opaque, short-lived bearer grant issued after guest checkout or OTP verification. */
export const bookingAccessGrantSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);
export type BookingAccessGrant = z.infer<typeof bookingAccessGrantSchema>;

/**
 * Preserve the existing customer booking shape while allowing guest clients to
 * persist a scoped access grant. Authenticated bookings intentionally return
 * null grant fields because the customer session already proves ownership.
 */
export const createBookingResponseSchema = bookingResponseSchema.extend({
  accessGrant: bookingAccessGrantSchema.nullable(),
  accessGrantExpiresInSec: z.number().int().positive().nullable(),
});
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

/** Exchange a single-use booking OTP for a scoped access grant. */
export const verifyBookingAccessInputSchema = z.object({
  otp: z.string().trim().min(4).max(10),
});
export type VerifyBookingAccessInput = z.infer<typeof verifyBookingAccessInputSchema>;

export const bookingAccessResponseSchema = z.object({
  booking: bookingResponseSchema,
  accessGrant: bookingAccessGrantSchema,
  expiresInSec: z.number().int().positive(),
});
export type BookingAccessResponse = z.infer<typeof bookingAccessResponseSchema>;
