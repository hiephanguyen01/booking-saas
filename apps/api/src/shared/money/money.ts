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

/** percent in basis points (12% = 1200 bps), rounded half up. */
export function percentOfBps(amount: Vnd, bps: number): Vnd {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new TypeError(`bps must be a non-negative integer, got ${bps}`);
  }
  const numerator = amount * BigInt(bps);
  const half = numerator < 0n ? -5_000n : 5_000n;
  return (numerator + half) / 10_000n;
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
