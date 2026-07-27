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

interface CutoffFormatters {
  time: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
}

const CUTOFF_FORMATTERS = new Map<string, CutoffFormatters>();

function cutoffFormatters(locale: Locale, timeZone: string): CutoffFormatters {
  const key = `${locale}:${timeZone}`;
  const cached = CUTOFF_FORMATTERS.get(key);
  if (cached) return cached;

  const localeCode = locale === 'en' ? 'en-US' : 'vi-VN';
  const formatters = {
    time: new Intl.DateTimeFormat(localeCode, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }),
    date: new Intl.DateTimeFormat(localeCode, {
      day: 'numeric',
      month: 'numeric',
      timeZone,
    }),
  };
  CUTOFF_FORMATTERS.set(key, formatters);
  return formatters;
}

/** `{ time, day, month }` for a cancellation cutoff in the booking resource timezone. */
export function cancellationCutoffParts(
  cutoffUtc: string,
  locale: Locale,
  timeZone: string,
): { time: string; day: number; month: number } {
  const date = new Date(cutoffUtc);
  const formatters = cutoffFormatters(locale, timeZone);
  const parts = formatters.date.formatToParts(date);
  return {
    time: formatters.time.format(date),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? 0),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? 0),
  };
}
