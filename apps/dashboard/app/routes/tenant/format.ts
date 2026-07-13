/**
 * Presentation helpers for the tenant console. All money crosses the wire as a
 * VND đồng integer string (possibly signed for ledger balances); never a float.
 */

/** Format a VND đồng amount (digit string / bigint / number) as `1.234.567 ₫`. */
export function formatVnd(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0 ₫';
  let n: bigint;
  try {
    n = typeof value === 'bigint' ? value : BigInt(typeof value === 'number' ? Math.round(value) : value);
  } catch {
    return `${value} ₫`;
  }
  const negative = n < 0n;
  const digits = (negative ? -n : n).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped} ₫`;
}

/** Compact VND for tight stat tiles: `1,2 tr` / `950 N` / `12.300 ₫`. */
export function formatVndCompact(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0 ₫';
  let n: number;
  try {
    n = Number(typeof value === 'bigint' ? value.toString() : value);
  } catch {
    return formatVnd(value);
  }
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')} tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} N`;
  return formatVnd(value);
}

const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

/** Partner legal-type → Vietnamese label. */
export const PARTNER_TYPE_LABEL: Record<string, string> = { individual: 'Cá nhân', company: 'Doanh nghiệp' };

/** A 0–1 fraction as a whole-percent string, e.g. `0.1234 → "12%"`. */
export function formatRate(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Whole-percent basis for a `percent` discount/rate stored as a digit string. */
export function formatDiscount(type: 'percent' | 'fixed', value: string): string {
  return type === 'percent' ? `${value}%` : formatVnd(value);
}
