import { formatVnd, percentOfBps } from '../../../shared/money/money';
import { wallClockInZone } from '../../../shared/time/time';
import type { BookingEmailPolicyItem, Locale } from './email-template';

interface CancellationTier {
  hoursBefore: number;
  refundPercent: number;
}

export interface BookingPolicyPresentationInput {
  snapshot: unknown;
  startUtc: Date;
  timezone: string;
  locale: Locale;
  paidAmount: bigint;
  depositAmount: bigint;
}

export interface BookingPolicyPresentation {
  items: BookingEmailPolicyItem[];
  noticeLines: string[];
  lines: string[];
}

const pad = (value: number): string => String(value).padStart(2, '0');

function cancellationTiers(snapshot: unknown): CancellationTier[] {
  if (!Array.isArray(snapshot)) return [];
  const tiers: CancellationTier[] = [];
  for (const item of snapshot) {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.hoursBefore !== 'number'
      || !Number.isFinite(record.hoursBefore)
      || !Number.isInteger(record.hoursBefore)
      || record.hoursBefore < 0
      || typeof record.refundPercent !== 'number'
      || !Number.isFinite(record.refundPercent)
      || !Number.isInteger(record.refundPercent)
      || record.refundPercent < 0
      || record.refundPercent > 100
    ) {
      return [];
    }
    tiers.push({
      hoursBefore: record.hoursBefore,
      refundPercent: record.refundPercent,
    });
  }
  return tiers.sort((left, right) => right.hoursBefore - left.hoursBefore);
}

function cutoff(start: Date, hoursBefore: number): Date {
  return new Date(start.getTime() - hoursBefore * 3_600_000);
}

function policyMoment(date: Date, timezone: string, locale: Locale): string {
  if (locale === 'en') {
    const dateText = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    }).format(date);
    const parts = wallClockInZone(date, timezone);
    return `${pad(parts.hour)}:${pad(parts.minute)}, ${dateText}`;
  }
  const parts = wallClockInZone(date, timezone);
  return `${pad(parts.hour)}:${pad(parts.minute)}, ngày ${pad(parts.day)} tháng ${pad(parts.month)}, ${parts.year}`;
}

function feeText(input: BookingPolicyPresentationInput, refundPercent: number): string {
  const feePercent = 100 - refundPercent;
  const fee = percentOfBps(input.paidAmount, feePercent * 100);
  if (fee <= 0n) return input.locale === 'vi' ? `phí ${feePercent}%` : `${feePercent}% fee`;
  const formattedFee = formatVnd(fee, input.locale).replace(/\u00a0/g, ' ');
  const paidBasis = input.depositAmount > 0n && input.paidAmount === input.depositAmount
    ? (input.locale === 'vi' ? 'tiền cọc' : 'the deposit')
    : (input.locale === 'vi' ? 'số tiền đã thanh toán' : 'the paid amount');
  return input.locale === 'vi'
    ? `phí ${formattedFee} (${feePercent}% ${paidBasis})`
    : `${formattedFee} fee (${feePercent}% of ${paidBasis})`;
}

export function bookingPolicyPresentation(
  input: BookingPolicyPresentationInput,
): BookingPolicyPresentation {
  console.log("🚀 ~ bookingPolicyPresentation ~ input:", input)
  const refundable = cancellationTiers(input.snapshot)
    .filter((tier) => tier.refundPercent > 0);
  if (refundable.length === 0) return { items: [], noticeLines: [], lines: [] };

  const items = refundable.map((tier, index): BookingEmailPolicyItem => {
    const tierCutoff = policyMoment(
      cutoff(input.startUtc, tier.hoursBefore),
      input.timezone,
      input.locale,
    );
    if (tier.refundPercent === 100) {
      return {
        text: input.locale === 'vi'
          ? `Hủy miễn phí trước ${tierCutoff}`
          : `Free cancellation before ${tierCutoff}`,
        tone: 'positive',
      };
    }
    const prior = refundable[index - 1];
    const starts = prior
      ? policyMoment(
          cutoff(input.startUtc, prior.hoursBefore),
          input.timezone,
          input.locale,
        )
      : undefined;
    return {
      text: input.locale === 'vi'
        ? `${starts ? `Từ ${starts} đến trước ${tierCutoff}` : `Trước ${tierCutoff}`}: ${feeText(input, tier.refundPercent)}`
        : `${starts ? `From ${starts} until ${tierCutoff}` : `Before ${tierCutoff}`}: ${feeText(input, tier.refundPercent)}`,
      tone: 'neutral',
    };
  });

  const lastRefundable = refundable.at(-1)!;
  const noRefundFrom = policyMoment(
    cutoff(input.startUtc, lastRefundable.hoursBefore),
    input.timezone,
    input.locale,
  );
  const noticeLines = [input.locale === 'vi'
    ? `Hủy từ ${noRefundFrom} hoặc vắng mặt vào ngày thực hiện đơn sẽ không được hoàn tiền.`
    : `Cancellations from ${noRefundFrom}, or a no-show on the booking date, are not refundable.`];
  return {
    items,
    noticeLines,
    lines: [...items.map((item) => item.text), ...noticeLines],
  };
}
