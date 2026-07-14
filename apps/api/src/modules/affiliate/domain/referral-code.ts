/**
 * Short, unambiguous referral code, e.g. `R-7F3K9Q` (§15.1). Unique within a
 * tenant (`referral_links.(tenant_id, code)`); the caller retries on collision.
 * Pure — the caller injects a random source (crypto in prod, a stub in tests).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCode(randomInt: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `R-${code}`;
}

/** Normalise a code as entered (link query, manual input) for a case-insensitive match. */
export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}
