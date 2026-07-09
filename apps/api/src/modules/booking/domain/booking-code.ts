/**
 * Short customer-facing booking code, e.g. `BK-7F3K9Q` (§7.5). Ambiguous
 * characters (0/O, 1/I) are excluded. Pure — the caller injects a random source
 * (crypto in prod, a stub in tests).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateBookingCode(randomInt: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `BK-${code}`;
}
