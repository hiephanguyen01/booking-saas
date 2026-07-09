/**
 * Presentation helpers for the platform-admin area (Task 1.12). Money arrives as
 * VND đồng digit strings; these format for Vietnamese readers. Pure + client-safe.
 */

/** Full VND amount, e.g. `1.250.000 ₫`. Accepts a đồng digit string. */
export function formatVnd(digits: string | number): string {
  const n = typeof digits === 'number' ? digits : Number(digits ?? 0);
  if (!Number.isFinite(n)) return '0 ₫';
  return `${new Intl.NumberFormat('vi-VN').format(n)} ₫`;
}

/** Compact VND for tiles/axes: `1,25 tỷ`, `340 tr`, `85 N`, `900 ₫`. */
export function formatVndShort(digits: string | number): string {
  const n = typeof digits === 'number' ? digits : Number(digits ?? 0);
  if (!Number.isFinite(n) || n === 0) return '0 ₫';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} tr`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} N`;
  return `${sign}${abs} ₫`;
}

function trim(v: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(
    Math.round(v * 100) / 100,
  );
}

/** Whole-number formatter with vi grouping. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

/** `09/07/2026` from an ISO string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** `09/07/2026 14:20` from an ISO string. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Time-to-first-booking as a human span: `—`, `6 giờ`, `3 ngày`. */
export function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return '< 1 giờ';
  if (hours < 48) return `${Math.round(hours)} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/** Days-left phrasing for expiry queues: `Hết hạn`, `Hôm nay`, `còn 5 ngày`. */
export function formatDaysLeft(days: number): string {
  if (days < 0) return 'Đã hết hạn';
  if (days === 0) return 'Hết hạn hôm nay';
  if (days === 1) return 'Còn 1 ngày';
  return `Còn ${days} ngày`;
}

export const TENANT_STATUS_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  suspended: 'Tạm ngưng',
  expired: 'Hết hạn',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trial: 'Dùng thử',
  active: 'Đang hiệu lực',
  past_due: 'Quá hạn thanh toán',
  expired: 'Hết hạn',
  cancelled: 'Đã huỷ',
};

export const VERTICAL_LABELS: Record<string, string> = {
  studio: 'Studio',
  rental: 'Cho thuê',
  classes: 'Lớp học',
};
