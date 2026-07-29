/**
 * Arithmetic on VND đồng amounts.
 *
 * Money crosses the wire as a canonical digit string of up to 20 digits, so every
 * comparison and subtraction stays in `bigint` space — routing it through `Number`
 * loses precision at the top of the range and can return scientific notation.
 * Rendering lives in `formatVnd` (`~/lib/ui`); this module never formats.
 */

/** `Array.prototype.sort` comparator: ascending by amount. */
export function compareMoney(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The cheapest of the given amounts, or `null` when there are none. */
export function minMoney(values: readonly string[]): string | null {
  return values.reduce<string | null>(
    (lowest, value) => (lowest === null || compareMoney(value, lowest) < 0 ? value : lowest),
    null,
  );
}

/**
 * `minuend - subtrahend`, floored at zero — a balance or refund never displays
 * negative. Returns `'0'` for amounts that are not digit strings.
 */
export function subtractMoney(minuend: string, subtrahend: string): string {
  try {
    const balance = BigInt(minuend) - BigInt(subtrahend);
    return (balance > 0n ? balance : 0n).toString();
  } catch {
    return '0';
  }
}
