import { quoteResponseSchema } from '@booking/contracts';
import { formatVnd, percentOfBps } from '../../../shared/money/money';
import { wallClockInZone } from '../../../shared/time/time';
import type {
  BookingEmailPolicyItem,
  BookingEmailPriceLine,
  BookingCustomerEmailData,
  Locale,
} from './email-template';
import type { BookingNotificationContext } from './ports/notification-reader.port';

interface CancellationTier {
  hoursBefore: number;
  refundPercent: number;
}

export interface BookingConfirmationPresentation {
  duration: string;
  dateRange: string;
  timeBadge: string;
  detailStartsAt: string;
  detailEndsAt: string;
  pricing: NonNullable<BookingCustomerEmailData['pricing']>;
  policyItems: BookingEmailPolicyItem[];
  policyNoticeLines: string[];
}

const VI_WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

function dateLabel(date: Date, timezone: string, locale: Locale): string {
  if (locale === 'en') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    }).format(date);
  }
  const parts = wallClockInZone(date, timezone);
  return `${VI_WEEKDAYS[parts.weekday]}, ${pad(parts.day)} tháng ${pad(parts.month)}, ${parts.year}`;
}

function timeLabel(date: Date, timezone: string): string {
  const parts = wallClockInZone(date, timezone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function durationLabel(
  start: Date,
  end: Date,
  bookingMode: string,
  locale: Locale,
): string {
  const minutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
  if (bookingMode === 'daily') {
    const days = Math.max(1, Math.ceil(minutes / 1_440));
    return locale === 'vi' ? `${days} ngày` : `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return locale === 'vi' ? `${days} ngày` : `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return locale === 'vi' ? `${hours} giờ` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return locale === 'vi' ? `${minutes} phút` : `${minutes} minutes`;
}

function pricingSummaryLabel(
  ctx: BookingNotificationContext,
  duration: string,
  locale: Locale,
): string {
  const unit = ctx.bookingMode === 'inventory'
    ? (locale === 'vi' ? 'sản phẩm' : ctx.quantity === 1 ? 'item' : 'items')
    : ctx.bookingMode === 'appointment' || ctx.bookingMode === 'class'
      ? (locale === 'vi' ? 'suất' : ctx.quantity === 1 ? 'session' : 'sessions')
      : (locale === 'vi' ? 'dịch vụ' : ctx.quantity === 1 ? 'service' : 'services');
  return `${ctx.quantity} ${unit} x ${duration}`;
}

function pricingPresentation(
  ctx: BookingNotificationContext,
  locale: Locale,
  duration: string,
): NonNullable<BookingCustomerEmailData['pricing']> {
  const quote = quoteResponseSchema.safeParse(ctx.pricingSnapshot);
  const lines: BookingEmailPriceLine[] = quote.success
    ? quote.data.lineItems.map((line) => {
        const amount = BigInt(line.amount);
        const regularAmount = BigInt(line.regularAmount);
        const discountPercent = regularAmount > amount && regularAmount > 0n
          ? Number(((regularAmount - amount) * 100n) / regularAmount)
          : 0;
        return {
          label: line.quantity > 1 ? `${line.label} × ${line.quantity}` : line.label,
          amount: formatVnd(amount, locale),
          ...(regularAmount > amount ? { regularAmount: formatVnd(regularAmount, locale) } : {}),
          ...(discountPercent > 0 ? { discountPercent } : {}),
        };
      })
    : [];
  const quotedAmount = quote.success ? BigInt(quote.data.subtotal) : ctx.totalAmount;
  const regularAmount = quote.success ? BigInt(quote.data.regularSubtotal) : ctx.totalAmount;
  const pricingDiscountPercent = regularAmount > quotedAmount && regularAmount > 0n
    ? Number(((regularAmount - quotedAmount) * 100n) / regularAmount)
    : 0;
  const balance = ctx.finalAmount > ctx.paidAmount ? ctx.finalAmount - ctx.paidAmount : 0n;
  const paidIsPartialDeposit =
    ctx.depositAmount > 0n &&
    ctx.depositAmount < ctx.finalAmount &&
    ctx.paidAmount === ctx.depositAmount;
  const balanceText = balance > 0n ? formatVnd(balance, locale) : undefined;
  return {
    lines,
    summaryLine: {
      label: pricingSummaryLabel(ctx, duration, locale),
      amount: formatVnd(quotedAmount, locale),
      ...(regularAmount > quotedAmount
        ? { regularAmount: formatVnd(regularAmount, locale) }
        : {}),
      ...(pricingDiscountPercent > 0 ? { discountPercent: pricingDiscountPercent } : {}),
    },
    ...(ctx.discountAmount > 0n
      ? { promotionDiscount: formatVnd(ctx.discountAmount, locale) }
      : {}),
    total: formatVnd(ctx.finalAmount, locale),
    ...(ctx.paidAmount > 0n
      ? {
          paid: formatVnd(ctx.paidAmount, locale),
          paidLabel: paidIsPartialDeposit
            ? (locale === 'vi' ? 'Đã cọc' : 'Deposit paid')
            : (locale === 'vi' ? 'Đã thanh toán' : 'Paid'),
        }
      : {}),
    ...(paymentMethodLabel(ctx.paymentGateway, ctx.paymentMethod, locale)
      ? { paymentMethod: paymentMethodLabel(ctx.paymentGateway, ctx.paymentMethod, locale) }
      : {}),
    ...(balanceText ? { balance: balanceText } : {}),
    ...(balanceText
      ? {
          noticeLines: [locale === 'vi'
            ? `Quý khách còn ${balanceText} cần thanh toán.`
            : `${balanceText} remains to be paid.`],
        }
      : {}),
  };
}

function paymentMethodLabel(
  gateway: string | null,
  method: string | null,
  locale: Locale,
): string | undefined {
  const value = `${gateway ?? ''} ${method ?? ''}`.toLowerCase();
  if (value.includes('momo')) return 'MoMo';
  if (value.includes('zalo')) return 'ZaloPay';
  if (value.includes('card')) return locale === 'vi' ? 'Thẻ thanh toán' : 'Payment card';
  if (value.includes('bank') || value.includes('sepay') || value.includes('payos')) {
    return locale === 'vi' ? 'Chuyển khoản ngân hàng' : 'Bank transfer';
  }
  return undefined;
}

function cancellationTiers(snapshot: unknown): CancellationTier[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.hoursBefore !== 'number'
      || !Number.isFinite(record.hoursBefore)
      || typeof record.refundPercent !== 'number'
      || !Number.isFinite(record.refundPercent)
    ) {
      return [];
    }
    return [{
      hoursBefore: Math.max(0, Math.round(record.hoursBefore)),
      refundPercent: Math.max(0, Math.min(100, Math.round(record.refundPercent))),
    }];
  }).sort((left, right) => right.hoursBefore - left.hoursBefore);
}

function cutoff(start: Date, hoursBefore: number): Date {
  return new Date(start.getTime() - hoursBefore * 3_600_000);
}

function policyMoment(date: Date, timezone: string, locale: Locale): string {
  const timeText = timeLabel(date, timezone);
  if (locale === 'vi') {
    const parts = wallClockInZone(date, timezone);
    return `${timeText}, ngày ${pad(parts.day)} tháng ${pad(parts.month)}, ${parts.year}`;
  }
  return `${timeText}, ${dateLabel(date, timezone, locale)}`;
}

function feeText(ctx: BookingNotificationContext, refundPercent: number, locale: Locale): string {
  const feePercent = 100 - refundPercent;
  const fee = percentOfBps(ctx.paidAmount, feePercent * 100);
  if (fee <= 0n) return locale === 'vi' ? `phí ${feePercent}%` : `${feePercent}% fee`;
  const paidBasis = ctx.depositAmount > 0n && ctx.paidAmount === ctx.depositAmount
    ? (locale === 'vi' ? 'tiền cọc' : 'the deposit')
    : (locale === 'vi' ? 'số tiền đã thanh toán' : 'the paid amount');
  return locale === 'vi'
    ? `phí ${formatVnd(fee, locale)} (${feePercent}% ${paidBasis})`
    : `${formatVnd(fee, locale)} fee (${feePercent}% of ${paidBasis})`;
}

function policyPresentation(
  ctx: BookingNotificationContext,
  locale: Locale,
): { items: BookingEmailPolicyItem[]; notices: string[] } {
  const tiers = cancellationTiers(ctx.cancellationPolicySnapshot);
  const refundable = tiers.filter((tier) => tier.refundPercent > 0);
  if (refundable.length === 0) return { items: [], notices: [] };

  const items = refundable.map((tier, index): BookingEmailPolicyItem => {
    const tierCutoff = policyMoment(cutoff(ctx.startUtc, tier.hoursBefore), ctx.timezone, locale);
    if (tier.refundPercent === 100) {
      return {
        text: locale === 'vi'
          ? `Hủy miễn phí trước ${tierCutoff}`
          : `Free cancellation before ${tierCutoff}`,
        tone: 'positive',
      };
    }
    const prior = refundable[index - 1];
    const starts = prior
      ? policyMoment(cutoff(ctx.startUtc, prior.hoursBefore), ctx.timezone, locale)
      : undefined;
    return {
      text: locale === 'vi'
        ? `${starts ? `Từ ${starts} đến trước ${tierCutoff}` : `Trước ${tierCutoff}`}: ${feeText(ctx, tier.refundPercent, locale)}`
        : `${starts ? `From ${starts} until ${tierCutoff}` : `Before ${tierCutoff}`}: ${feeText(ctx, tier.refundPercent, locale)}`,
      tone: 'neutral',
    };
  });

  const notices = items.map((item) => item.text);
  const lastRefundable = refundable.at(-1);
  if (lastRefundable) {
    const noRefundFrom = policyMoment(
      cutoff(ctx.startUtc, lastRefundable.hoursBefore),
      ctx.timezone,
      locale,
    );
    notices.push(locale === 'vi'
      ? `Hủy từ ${noRefundFrom} hoặc vắng mặt vào ngày thực hiện đơn sẽ không được hoàn tiền.`
      : `Cancellations from ${noRefundFrom}, or a no-show on the booking date, are not refundable.`);
  }
  return { items, notices };
}

export function bookingConfirmationPresentation(
  ctx: BookingNotificationContext,
  locale: Locale,
): BookingConfirmationPresentation {
  const duration = durationLabel(ctx.startUtc, ctx.endUtc, ctx.bookingMode, locale);
  const policy = policyPresentation(ctx, locale);
  return {
    duration,
    dateRange: `${dateLabel(ctx.startUtc, ctx.timezone, locale)} - ${dateLabel(ctx.endUtc, ctx.timezone, locale)}`,
    timeBadge: `${timeLabel(ctx.startUtc, ctx.timezone)} - ${timeLabel(ctx.endUtc, ctx.timezone)} (${duration})`,
    detailStartsAt: `${dateLabel(ctx.startUtc, ctx.timezone, locale)} | ${timeLabel(ctx.startUtc, ctx.timezone)}`,
    detailEndsAt: `${dateLabel(ctx.endUtc, ctx.timezone, locale)} | ${timeLabel(ctx.endUtc, ctx.timezone)}`,
    pricing: pricingPresentation(ctx, locale, duration),
    policyItems: policy.items,
    policyNoticeLines: policy.notices,
  };
}
