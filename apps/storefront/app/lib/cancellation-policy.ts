import type { CancellationTier } from '@booking/contracts';
import type { Locale } from '@booking/i18n';

export interface CancellationPolicyLine {
  /** The exact instant this tier's refund rate stops applying, derived from `startUtc - hoursBefore`. */
  cutoffUtc: string;
  refundPercent: number;
  /** `100 - refundPercent`; 0 means this tier is still a full refund. */
  feePercent: number;
  /** VND đồng digit string: `depositAmount * feePercent / 100`. */
  feeAmount: string;
}

/**
 * Maps cancellation tiers (sorted most-lenient first) to one display line per tier. The
 * cutoff date/time and fee amount are computed from `startUtc`/`depositAmount` — nothing
 * here is a fixed bracket or invented copy, only real numbers derived from the tiers. Shared
 * between the account booking history (frozen `cancellationPolicySnapshot`) and checkout
 * (the listing's live policy, previewed against the slot the customer is booking).
 */
export function cancellationPolicyLines(params: {
  startUtc: string;
  depositAmount: string;
  tiers: CancellationTier[];
}): CancellationPolicyLine[] {
  const startMs = Date.parse(params.startUtc);
  return [...params.tiers]
    .sort((a, b) => b.hoursBefore - a.hoursBefore)
    .map((tier) => {
      const refundPercent = Math.max(0, Math.min(100, tier.refundPercent));
      const feePercent = 100 - refundPercent;
      const cutoffUtc = new Date(startMs - Math.max(0, tier.hoursBefore) * 3_600_000).toISOString();
      const feeAmount =
        feePercent > 0
          ? ((BigInt(params.depositAmount) * BigInt(feePercent)) / 100n).toString()
          : '0';
      return { cutoffUtc, refundPercent, feePercent, feeAmount };
    });
}

const CUTOFF_TIME_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }),
  vi: new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }),
};

const CUTOFF_DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }),
  vi: new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }),
};

/** `{ time, day, month }` for a cancellation cutoff, in the fixed `Asia/Ho_Chi_Minh` zone. */
export function cancellationCutoffParts(
  cutoffUtc: string,
  locale: Locale,
): { time: string; day: number; month: number } {
  const date = new Date(cutoffUtc);
  const parts = CUTOFF_DATE_FORMATTERS[locale].formatToParts(date);
  return {
    time: CUTOFF_TIME_FORMATTERS[locale].format(date),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? 0),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? 0),
  };
}
