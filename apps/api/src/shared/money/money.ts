/**
 * Money = VND as bigint, always integer đồng (TONG-QUAN.md §18). No floats
 * anywhere: fractional math (commission %) uses basis points with half-up
 * rounding so ledger legs stay exact.
 */
export type Vnd = bigint;

export function vnd(amount: number | string | bigint): Vnd {
  if (typeof amount === 'bigint') return amount;
  if (typeof amount === 'number') {
    if (!Number.isSafeInteger(amount)) {
      throw new TypeError(`VND amount must be an integer, got ${amount}`);
    }
    return BigInt(amount);
  }
  if (!/^-?\d+$/.test(amount.trim())) {
    throw new TypeError(`VND amount must be an integer string, got "${amount}"`);
  }
  return BigInt(amount.trim());
}

/**
 * The lenient counterpart of {@link vnd}: one untrusted jsonb value → VND đồng,
 * or `null` when it isn't a usable amount. Use it for `mode_config` prices and
 * other stored JSON; use `vnd()` where a bad value is a programming error.
 *
 * The canonical wire form is a digit STRING (§7.3 — money never travels as a JS
 * number), parsed with `BigInt`, never `Number()`: `Number()` on a big VND
 * string silently loses precision past 2^53. A number IS still accepted because
 * `prisma/seed.ts` writes `basePrice: 300_000` straight to the jsonb column,
 * bypassing the contract — so real rows hold both shapes and a string-only
 * parser would blank out every seeded listing's price. It must be an exact
 * integer: `BigInt(3.5)` throws, and a float was never a valid VND amount.
 *
 * A malformed value is skipped rather than silently becoming `NaN`/`0` and
 * inventing a price.
 */
export function toVnd(raw: unknown): Vnd | null {
  if (typeof raw === 'string') return /^\d+$/.test(raw) ? BigInt(raw) : null;
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  return null;
}

/** percent in basis points (12% = 1200 bps), rounded half up. */
export function percentOfBps(amount: Vnd, bps: number): Vnd {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new TypeError(`bps must be a non-negative integer, got ${bps}`);
  }
  const numerator = amount * BigInt(bps);
  const half = numerator < 0n ? -5_000n : 5_000n;
  return (numerator + half) / 10_000n;
}

/**
 * The VAT *contained in* a VAT-INCLUSIVE amount: `gross × bps / (10000 + bps)`,
 * half-up.
 *
 * This is NOT `percentOfBps(gross, bps)` — that computes the VAT to ADD to a net
 * price. Storefront prices are gross (§VAT: giá niêm yết đã gồm thuế), so using
 * the wrong one overstates VAT by ~8% of the whole booking. Always take the net
 * with {@link netOfVat} rather than rounding a second time, so the two legs
 * re-sum to the exact gross and the ledger cannot drift by a đồng.
 */
export function vatFromGross(gross: Vnd, bps: number): Vnd {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new TypeError(`bps must be a non-negative integer, got ${bps}`);
  }
  if (bps === 0 || gross <= 0n) return 0n;
  const denominator = 10_000n + BigInt(bps);
  // round(x/y) half-up === floor((2x + y) / 2y) for positive integers.
  return (gross * BigInt(bps) * 2n + denominator) / (denominator * 2n);
}

/** The VAT-exclusive part of a gross amount. `netOfVat(g,b) + vatFromGross(g,b) === g`. */
export function netOfVat(gross: Vnd, bps: number): Vnd {
  return gross - vatFromGross(gross, bps);
}

export function formatVnd(amount: Vnd, locale: 'vi' | 'en' = 'vi'): string {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Parses user-facing strings like "120.000 ₫" / "120,000" back to bigint. */
export function parseVnd(input: string): Vnd {
  const digits = input.replace(/[^\d-]/g, '');
  if (!/^-?\d+$/.test(digits)) {
    throw new TypeError(`Cannot parse VND amount from "${input}"`);
  }
  return BigInt(digits);
}
