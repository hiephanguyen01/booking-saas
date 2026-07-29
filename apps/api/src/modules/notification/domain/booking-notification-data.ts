import { formatVnd } from '../../../shared/money/money';
import { formatInZone } from '../../../shared/time/time';
import { bookingConfirmationPresentation } from './booking-confirmation-presentation';
import { normalizeLocale, type TemplateData } from './email-template';
import type { NotificationPlanItem, NotificationTemplateId } from './notification-plan';
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
  payload: { refundAmount?: string; refundPercent?: number; reason?: string },
  templateId: NotificationTemplateId,
): TemplateData {
  const locale = normalizeLocale(recipient.locale);
  const isCustomer = templateId.endsWith('_customer');
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
  const scheduledPolicyLines = [
        ...confirmation.policyItems.map((item) => item.text),
        ...confirmation.policyNoticeLines,
      ];
  const policyLines = templateId === 'booking_refunded_customer'
      || templateId === 'booking_refunded_partner'
    ? []
    : templateId === 'booking_cancelled_customer'
      || templateId === 'booking_cancelled_partner'
      ? cancellationOutcomeLines(
          ctx,
          locale,
          isCustomer,
          payload.refundPercent ?? ctx.refundPercent,
          refundedAmount,
        )
      : scheduledPolicyLines;
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
    ...(policyLines.length ? { policyLines } : {}),
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
      noticeLines: templateId === 'booking_cancelled_customer'
        || templateId === 'booking_no_show_customer'
        ? policyLines
        : [],
    },
  };
}

function cancellationOutcomeLines(
  ctx: BookingNotificationContext,
  locale: 'vi' | 'en',
  isCustomer: boolean,
  refundPercent: number | null,
  refundAmount: bigint,
): string[] {
  if (
    refundPercent === null
    || !Number.isInteger(refundPercent)
    || refundPercent < 0
    || refundPercent > 100
  ) {
    return [];
  }

  const feePercent = ctx.paidAmount > 0n ? 100 - refundPercent : 0;
  const subject = locale === 'vi'
    ? (isCustomer ? 'Đơn của quý khách' : 'Đơn')
    : (isCustomer ? 'Your booking' : 'The booking');
  const basis = ctx.depositAmount > 0n && ctx.paidAmount === ctx.depositAmount
    ? (locale === 'vi' ? 'cọc' : 'the deposit')
    : (locale === 'vi' ? 'số tiền đã thanh toán' : 'the paid amount');
  const outcome = locale === 'vi'
    ? feePercent === 0
      ? `${subject} được áp dụng chính sách Hủy miễn phí`
      : `${subject} được áp dụng chính sách Hủy mất ${feePercent}% ${basis}`
    : feePercent === 0
      ? `${subject} is subject to free cancellation`
      : `${subject} is subject to a cancellation policy that forfeits ${feePercent}% of ${basis}`;

  return [
    outcome,
    ...(refundAmount > 0n
      ? [locale === 'vi'
          ? 'Việc hoàn tiền thường mất 10-15 ngày làm việc'
          : 'Refunds usually take 10-15 business days']
      : []),
  ];
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

function safeHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
