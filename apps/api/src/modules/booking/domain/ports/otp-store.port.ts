export const OTP_STORE = Symbol('OTP_STORE');

/** Email-OTP for guest booking lookup/cancel (§8.6). Delivery is Task 1.16. */
export interface IOtpStore {
  /** Generate + store a one-time code for a booking; returns the plaintext OTP. */
  issue(bookingCode: string): Promise<{ otp: string; expiresInSec: number }>;
  /** True if `otp` matches the stored code (single-use — consumed on success). */
  verify(bookingCode: string, otp: string): Promise<boolean>;
}
