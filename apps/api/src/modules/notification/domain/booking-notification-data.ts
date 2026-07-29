import { formatVnd } from '../../../shared/money/money';
import { formatInZone } from '../../../shared/time/time';
import { bookingConfirmationPresentation } from './booking-confirmation-presentation';
import { normalizeLocale, type TemplateData } from './email-template';
import type { NotificationPlanItem } from './notification-plan';
import type {
  BookingNotificationContext,
  NotificationRecipient,
} from './ports/notification-reader.port';

/**
 * Pure helpers shared by the booking dispatch use-cases — no ports, no I/O.
 * Resolve which recipients a plan item addresses and build the template data
 * for a booking email in the recipient's locale.
 */
export function audienceRecipients(
  item: NotificationPlanItem,
  ctx: BookingNotificationContext,
): NotificationRecipient[] {
  if (item.audience === 'customer') return ctx.customer ? [ctx.customer] : [];
  return ctx.partnerRecipients;
}

export function bookingTemplateData(
  ctx: BookingNotificationContext,
  recipient: NotificationRecipient,
  payload: { refundAmount?: string; reason?: string },
): TemplateData {
  const locale = normalizeLocale(recipient.locale);
  const isCustomer = ctx.customer?.userId === recipient.userId;
  const refundedAmount = payload.refundAmount
    ? BigInt(payload.refundAmount)
    : ctx.refundedAmount;
  const cancellationFee =
    ctx.paidAmount > refundedAmount ? ctx.paidAmount - refundedAmount : 0n;
  const balance = ctx.finalAmount > ctx.paidAmount
    ? ctx.finalAmount - ctx.paidAmount
    : 0n;
  const startsAt = formatInZone(ctx.startUtc, ctx.timezone, locale);
  const endsAt = formatInZone(ctx.endUtc, ctx.timezone, locale);
  const confirmation = bookingConfirmationPresentation(ctx, locale);
  const fee = ctx.paidAmount > refundedAmount ? ctx.paidAmount - refundedAmount : 0n;
  return {
    tenantName: ctx.tenantName,
    recipientName: recipient.name,
    bookingCode: ctx.code,
    listingTitle: ctx.listingTitle,
    partnerName: ctx.partnerName,
    startsAt,
    endsAt,
    listingAddress: ctx.listingAddress ?? undefined,
    totalAmount: formatVnd(ctx.totalAmount, locale),
    amount: formatVnd(ctx.finalAmount, locale),
    discountAmount: ctx.discountAmount > 0n ? formatVnd(ctx.discountAmount, locale) : undefined,
    depositAmount: ctx.depositAmount > 0n ? formatVnd(ctx.depositAmount, locale) : undefined,
    balanceAmount: balance > 0n ? formatVnd(balance, locale) : undefined,
    refundAmount: refundedAmount > 0n ? formatVnd(refundedAmount, locale) : undefined,
    cancellationFee: cancellationFee > 0n ? formatVnd(cancellationFee, locale) : undefined,
    recipientEmail: isCustomer ? recipient.email : undefined,
    recipientPhone: isCustomer ? recipient.phone : undefined,
    customerNote: isCustomer ? (ctx.customerNote ?? undefined) : undefined,
    policyText: cancellationPolicyText(ctx.cancellationPolicySnapshot, locale),
    ctaUrl: isCustomer
      ? `${ctx.brand.storefrontUrl ?? 'http://localhost:5173'}/${locale}/bookings/${encodeURIComponent(ctx.code)}`
      : `${ctx.brand.dashboardUrl}/partner/bookings/${ctx.bookingId}`,
    reason: payload.reason,
    bookingCustomer: {
      provider: {
        name: ctx.partnerName,
        ...(ctx.providerAddress ? { address: ctx.providerAddress } : {}),
        ...(ctx.providerPhone ? { phone: ctx.providerPhone } : {}),
      },
      service: {
        title: ctx.listingTitle,
        ...(safeHttpUrl(ctx.listingImageUrl) ? { imageUrl: ctx.listingImageUrl! } : {}),
        schedule: `${startsAt} – ${endsAt}`,
        duration: confirmation.duration,
        confirmationDateRange: confirmation.dateRange,
        confirmationTimeBadge: confirmation.timeBadge,
      },
      detailStartsAt: confirmation.detailStartsAt,
      detailEndsAt: confirmation.detailEndsAt,
      pricing: confirmation.pricing,
      refund: {
        ...(refundedAmount > 0n ? { amount: formatVnd(refundedAmount, locale) } : {}),
        ...(fee > 0n ? { fee: formatVnd(fee, locale) } : {}),
        ...(refundDestination(ctx.paymentGateway, ctx.paymentMethod, locale)
          ? { destination: refundDestination(ctx.paymentGateway, ctx.paymentMethod, locale)! }
          : {}),
      },
      policyItems: confirmation.policyItems,
      policyNoticeLines: confirmation.policyNoticeLines,
      noticeLines: bookingNoticeLines(ctx, refundedAmount, locale),
    },
  };
}

function paymentMethodLabel(
  gateway: string | null,
  method: string | null,
  locale: 'vi' | 'en',
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

function refundDestination(
  gateway: string | null,
  method: string | null,
  locale: 'vi' | 'en',
): string | undefined {
  const label = paymentMethodLabel(gateway, method, locale);
  if (label === 'MoMo' || label === 'ZaloPay') return label;
  if (!label) return undefined;
  return locale === 'vi' ? 'Phương thức thanh toán ban đầu' : 'Original payment method';
}

function bookingNoticeLines(
  ctx: BookingNotificationContext,
  refundedAmount: bigint,
  locale: 'vi' | 'en',
): string[] {
  if (ctx.status === 'no_show') {
    return [locale === 'vi'
      ? 'Đơn áp dụng chính sách vắng mặt và không được hoàn tiền.'
      : 'The booking is subject to the no-show policy and is not refundable.'];
  }
  if (ctx.status === 'cancelled' && ctx.refundPercent !== null) {
    const feePercent = Math.max(0, 100 - ctx.refundPercent);
    return [locale === 'vi'
      ? `Đơn được áp dụng chính sách hủy với phí ${feePercent}% số tiền đã thanh toán.`
      : `A cancellation fee of ${feePercent}% of the paid amount applies to this booking.`];
  }
  if (ctx.status === 'refunded' && refundedAmount > 0n) return [];
  return [];
}

function safeHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function cancellationPolicyText(snapshot: unknown, locale: 'vi' | 'en'): string | undefined {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return undefined;
  const tiers = snapshot.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return typeof record.hoursBefore === 'number' && typeof record.refundPercent === 'number'
      ? [{ hoursBefore: record.hoursBefore, refundPercent: record.refundPercent }]
      : [];
  });
  if (tiers.length === 0) return undefined;
  return tiers
    .map(({ hoursBefore, refundPercent }) =>
      locale === 'vi'
        ? `Hủy trước ${hoursBefore} giờ: hoàn ${refundPercent}%.`
        : `Cancel ${hoursBefore} hours before: ${refundPercent}% refund.`,
    )
    .join(' ');
}
