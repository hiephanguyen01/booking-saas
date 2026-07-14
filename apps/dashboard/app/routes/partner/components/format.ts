import type { BookingStatus } from '@booking/contracts';

/** VN market timezone - the calendar buckets and clocks render in this zone. */
export const TZ = 'Asia/Ho_Chi_Minh';

/** Format a VND đồng digit string as e.g. "1.250.000 ₫". Signed strings allowed. */
export function formatVnd(digits: string): string {
  const negative = digits.startsWith('-');
  const n = Number(negative ? digits.slice(1) : digits);
  if (!Number.isFinite(n)) return `${digits} ₫`;
  const formatted = new Intl.NumberFormat('vi-VN').format(n);
  return `${negative ? '-' : ''}${formatted} ₫`;
}

/** Compact VND for tight KPI tiles, e.g. "1,25 tr" / "980 N". */
export function formatVndCompact(digits: string): string {
  const negative = digits.startsWith('-');
  const n = Number(negative ? digits.slice(1) : digits);
  if (!Number.isFinite(n)) return `${digits} ₫`;
  const sign = negative ? '-' : '';
  if (n >= 1_000_000_000) return `${sign}${round(n / 1_000_000_000)} tỷ`;
  if (n >= 1_000_000) return `${sign}${round(n / 1_000_000)} tr`;
  if (n >= 1_000) return `${sign}${round(n / 1_000)} N`;
  return `${sign}${n} ₫`;
}

function round(n: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n);
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = partsCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, ...opts });
    partsCache.set(key, f);
  }
  return f;
}

/** Local calendar day key ("YYYY-MM-DD" in TZ) for bucketing an ISO instant. */
export function dayKey(iso: string): string {
  const p = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Day key for a Date already anchored to a calendar day (uses TZ parts). */
export function dayKeyOf(date: Date): string {
  return dayKey(date.toISOString());
}

/** Local clock, e.g. "14:30". */
export function formatTime(iso: string): string {
  return fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Local hour (0-23) of an instant in TZ - used to place events on the day grid. */
export function localHour(iso: string): number {
  const p = fmt({ hour: '2-digit', hour12: false }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === 'hour')?.value ?? '0') % 24;
}

/** Local minutes-since-midnight of an instant in TZ. */
export function minutesOfDay(iso: string): number {
  const p = fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? '0') % 24;
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** Short date label, e.g. "T2, 08/07". */
export function formatDayLabel(date: Date): string {
  return fmt({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

/** Full date, e.g. "08 tháng 7, 2026". */
export function formatDate(iso: string): string {
  return fmt({ day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso));
}

// ── Booking status presentation ───────────────────────────────────────────────

export interface StatusMeta {
  label: string;
  /** Badge variant + a calendar-event tint (bg/border/text) in one place. */
  badge: 'default' | 'secondary' | 'outline' | 'destructive';
  dot: string;
  event: string;
}

export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  draft: { label: 'Nháp', badge: 'outline', dot: 'bg-muted-foreground', event: 'border-border bg-muted text-muted-foreground' },
  pending_approval: {
    label: 'Chờ duyệt',
    badge: 'secondary',
    dot: 'bg-amber-500',
    event: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  pending_payment: {
    label: 'Chờ thanh toán',
    badge: 'secondary',
    dot: 'bg-sky-500',
    event: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  confirmed: {
    label: 'Đã xác nhận',
    badge: 'default',
    dot: 'bg-emerald-500',
    event: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  completed: {
    label: 'Hoàn tất',
    badge: 'outline',
    dot: 'bg-teal-500',
    event: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
  cancelled: {
    label: 'Đã huỷ',
    badge: 'outline',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted/60 text-muted-foreground line-through',
  },
  no_show: {
    label: 'Vắng mặt',
    badge: 'destructive',
    dot: 'bg-rose-500',
    event: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  rejected: {
    label: 'Từ chối',
    badge: 'destructive',
    dot: 'bg-rose-500',
    event: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  expired: { label: 'Hết hạn', badge: 'outline', dot: 'bg-muted-foreground', event: 'border-border bg-muted text-muted-foreground' },
  refunded: {
    label: 'Đã hoàn tiền',
    badge: 'outline',
    dot: 'bg-violet-500',
    event: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
};

export function statusMeta(status: BookingStatus): StatusMeta {
  return BOOKING_STATUS[status] ?? BOOKING_STATUS.draft;
}
