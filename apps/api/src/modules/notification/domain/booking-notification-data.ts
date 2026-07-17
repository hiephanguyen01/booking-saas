import { formatVnd } from '../../../shared/money/money';
import { formatInZone } from '../../../shared/time/time';
import type { TemplateData } from './email-template';
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
  const locale = recipient.locale === 'en' ? 'en' : 'vi';
  return {
    tenantName: ctx.tenantName,
    recipientName: recipient.name,
    bookingCode: ctx.code,
    listingTitle: ctx.listingTitle,
    partnerName: ctx.partnerName,
    startsAt: formatInZone(ctx.startUtc, ctx.timezone, locale),
    amount: formatVnd(ctx.finalAmount, locale),
    refundAmount: formatVnd(payload.refundAmount ? BigInt(payload.refundAmount) : 0n, locale),
    reason: payload.reason,
  };
}
