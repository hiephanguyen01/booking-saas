/**
 * Phone masking for partner-facing booking surfaces (§7.3 anti-disintermediation).
 *
 * Partners must not be able to harvest customer contact details and take the
 * relationship off-platform, but they DO need to reach a guest once the booking
 * is confirmed. So the partner mapper masks the phone until then — and masks it
 * HERE, server-side, so the real number never leaves the API. Hiding it in CSS
 * (or trusting the client to mask) would ship the number in the JSON payload.
 *
 * Pure and total: no framework imports, never throws, never returns a partially
 * revealed short number.
 */

/** Leading characters left visible (VN carrier prefix, e.g. `0912`). */
const HEAD = 4;
/** Trailing characters left visible — enough for a guest to confirm "that's me". */
const TAIL = 3;
const MASK_CHAR = '•';

/**
 * Mask a phone number, revealing only its head and tail:
 * `0912345678` → `0912•••678`.
 *
 * A value too short to reveal `HEAD + TAIL` without exposing essentially the
 * whole number is masked completely (only its length leaks). Non-digit
 * characters are masked positionally like any other, so a formatted number
 * (`+84 912 345 678`) still yields a non-contactable string.
 *
 * @param phone raw phone, possibly null/empty (the `users.phone` column is nullable)
 * @returns the masked string, or null when there is nothing to mask
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;
  // Too short to keep head+tail without revealing (nearly) everything → mask it all.
  if (trimmed.length <= HEAD + TAIL) return MASK_CHAR.repeat(trimmed.length);
  return (
    trimmed.slice(0, HEAD) + MASK_CHAR.repeat(trimmed.length - HEAD - TAIL) + trimmed.slice(-TAIL)
  );
}
