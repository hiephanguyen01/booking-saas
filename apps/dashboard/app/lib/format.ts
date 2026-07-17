import { TZ } from '~/constants/time';

/**
 * The one presentation/format module for the whole dashboard (admin · tenant ·
 * partner · affiliate). Pure functions only — display CONSTANTS (label maps,
 * timezone data) live in `~/constants/*`. Client-safe, no framework imports.
 *
 * Load-bearing rules this module enforces (CLAUDE.md §2.1 rule 4 + §6):
 * - **Money is bigint VND.** `formatVnd` parses digit strings with `BigInt`,
 *   never `Number(...)`, so a 17-digit đồng amount never loses precision.
 * - **Time is always rendered in the VN market timezone (`TZ`).** Every date/
 *   time helper pins `timeZone: TZ`, so the server and the browser format the
 *   same instant to the same wall-clock day — no SSR/CSR hydration mismatch and
 *   no "wrong day" from a server running in UTC.
 * - Null/invalid dates render as an em dash (`—`); blank money renders `0 ₫`.
 */

// ── Timezone-pinned date/time ────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** Cached `Intl.DateTimeFormat`, always pinned to `TZ` (vi-VN, 24h). */
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hourCycle: 'h23', ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** Parse an ISO instant; `null` for nullish/blank/unparseable input. */
function toValidDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `16/07/2026` in TZ. Nullish/invalid → `—`. */
export function formatDate(iso: string | null | undefined): string {
  const d = toValidDate(iso);
  return d ? fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) : '—';
}

/** `16/07/2026 14:30` in TZ. Nullish/invalid → `—`. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = toValidDate(iso);
  return d
    ? fmt({
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d)
    : '—';
}

/** `14:30` in TZ. Nullish/invalid → `—`. */
export function formatTime(iso: string | null | undefined): string {
  const d = toValidDate(iso);
  return d ? fmt({ hour: '2-digit', minute: '2-digit' }).format(d) : '—';
}

/** `16/07` in TZ (day/month only — for tight chart axes). Nullish/invalid → `—`. */
export function formatDayMonth(iso: string | null | undefined): string {
  const d = toValidDate(iso);
  return d ? fmt({ day: '2-digit', month: '2-digit' }).format(d) : '—';
}

/** Local calendar day key (`YYYY-MM-DD` in TZ) for bucketing an ISO instant. */
export function dayKey(iso: string): string {
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(iso),
  );
  const get = (t: string): string => parts.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Local minutes-since-midnight of an instant in TZ — places events on a day grid. */
export function minutesOfDay(iso: string): number {
  const parts = fmt({ hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  const h = Number(parts.find((x) => x.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((x) => x.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** Short calendar-day label, e.g. `T2, 08/07` — for a Date anchored to a day. */
export function formatDayLabel(date: Date): string {
  return fmt({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

/**
 * Coarse Vietnamese relative time, e.g. `3 giờ trước` / `sau 2 ngày`. `now` is
 * injectable for testing; callers that render this MUST gate it behind an effect
 * (it depends on the wall clock and would otherwise mismatch on hydration).
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  const d = toValidDate(iso);
  if (!d) return '—';
  const diffMs = d.getTime() - now;
  const past = diffMs <= 0;
  const abs = Math.abs(diffMs);
  const wrap = (n: number, unit: string): string => (past ? `${n} ${unit} trước` : `sau ${n} ${unit}`);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return wrap(mins, 'phút');
  const hours = Math.round(mins / 60);
  if (hours < 24) return wrap(hours, 'giờ');
  const days = Math.round(hours / 24);
  if (days < 30) return wrap(days, 'ngày');
  const months = Math.round(days / 30);
  if (months < 12) return wrap(months, 'tháng');
  return wrap(Math.round(months / 12), 'năm');
}

// ── Money (VND đồng — bigint, never a float) ─────────────────────────────────

/**
 * Parse a VND đồng value to an exact bigint (`null` when blank/unparseable).
 * Strings go through `BigInt` — NEVER `Number(...)` — so a large đồng amount
 * keeps full precision (CLAUDE.md §2.1 rule 4).
 */
function toVndBigInt(value: string | bigint | number | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(Math.round(value)) : null;
  try {
    return BigInt(value.trim());
  } catch {
    return null;
  }
}

/** Full VND amount as `1.234.567 ₫`. Signed values allowed; blank → `0 ₫`. */
export function formatVnd(value: string | bigint | number | null | undefined): string {
  const n = toVndBigInt(value);
  if (n === null) {
    if (value === null || value === undefined || value === '') return '0 ₫';
    return `${value} ₫`;
  }
  const negative = n < 0n;
  const digits = (negative ? -n : n).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped} ₫`;
}

const compactFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/**
 * Compact VND for tight tiles/axes: `1,2 tr` · `950 N` · `12 tỷ`. The tier is
 * chosen by exact bigint comparison; only the small scaled quotient becomes a
 * number, so precision is never lost parsing the raw amount.
 */
export function formatVndCompact(value: string | bigint | number | null | undefined): string {
  const n = toVndBigInt(value);
  if (n === null) return formatVnd(value);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const sign = negative ? '-' : '';
  if (abs >= 1_000_000_000n) return `${sign}${compactFmt.format(scaleTenths(abs, 1_000_000_000n))} tỷ`;
  if (abs >= 1_000_000n) return `${sign}${compactFmt.format(scaleTenths(abs, 1_000_000n))} tr`;
  if (abs >= 1_000n) return `${sign}${compactFmt.format(scaleTenths(abs, 1_000n))} N`;
  return formatVnd(value);
}

/** `abs / unit` rounded half-up to one decimal, computed in bigint space. */
function scaleTenths(abs: bigint, unit: bigint): number {
  return Number((abs * 10n + unit / 2n) / unit) / 10;
}

// ── Numbers & percents ───────────────────────────────────────────────────────

const numberFmt = new Intl.NumberFormat('vi-VN');
const percentFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** Whole number with vi grouping, e.g. `1.250`. */
export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

/** A percentage number (already `0–100`) as vi-VN comma-decimal, e.g. `12,5%`. */
export function formatPercent(n: number): string {
  return Number.isFinite(n) ? `${percentFmt.format(n)}%` : '—';
}

/** A `0–1` fraction as a whole-percent string, e.g. `0.1234 → "12%"`. */
export function formatRate(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** A discount as `20%` (percent codes) or a VND amount (fixed codes). */
export function formatDiscount(type: 'percent' | 'fixed', value: string): string {
  return type === 'percent' ? `${value}%` : formatVnd(value);
}

/** Time-to-first-booking as a human span: `—` · `< 1 giờ` · `6 giờ` · `3 ngày`. */
export function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return '< 1 giờ';
  if (hours < 48) return `${Math.round(hours)} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/** Days-left phrasing for expiry queues: `Đã hết hạn` · `Hết hạn hôm nay` · `Còn 5 ngày`. */
export function formatDaysLeft(days: number): string {
  if (days < 0) return 'Đã hết hạn';
  if (days === 0) return 'Hết hạn hôm nay';
  if (days === 1) return 'Còn 1 ngày';
  return `Còn ${days} ngày`;
}
