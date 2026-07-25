import { z } from 'zod';
import { bookingResponseSchema } from './booking';

/** Opaque, short-lived bearer grant used after guest OTP verification or checkout. */
export const bookingAccessGrantSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);
export type BookingAccessGrant = z.infer<typeof bookingAccessGrantSchema>;

/**
 * Booking creation keeps the existing booking response shape. New clients may
 * additionally persist the optional guest access grant; old clients safely
 * ignore the extra fields.
 */
export const createBookingResponseSchema = bookingResponseSchema.extend({
  accessGrant: bookingAccessGrantSchema.nullable(),
  accessGrantExpiresInSec: z.number().int().positive().nullable(),
});
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

/** OTP verification request. The OTP is exchanged once and never reused as a session credential. */
export const verifyBookingAccessInputSchema = z.object({
  otp: z.string().trim().min(4).max(10),
});
export type VerifyBookingAccessInput = z.infer<typeof verifyBookingAccessInputSchema>;

/** Result of exchanging a valid OTP for a scoped, short-lived access grant. */
export const bookingAccessResponseSchema = z.object({
  booking: bookingResponseSchema,
  accessGrant: bookingAccessGrantSchema,
  expiresInSec: z.number().int().positive(),
});
export type BookingAccessResponse = z.infer<typeof bookingAccessResponseSchema>;
