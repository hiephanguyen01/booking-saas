import { formatVnd } from '../../../shared/money/money';
import { normalizeLocale, type TemplateData } from './email-template';
import type { NotificationRecipient, PartnerNotificationContext } from './ports/notification-reader.port';

/**
 * Template data for `payout.paid` — the parallel of `bookingTemplateData` for the
 * payout email. The amount arrives as a decimal string on the outbox payload (bigint
 * never crosses the event boundary) and is formatted in the recipient's locale.
 */
export function payoutTemplateData(
  ctx: PartnerNotificationContext,
  recipient: NotificationRecipient,
  payload: { amount: string },
): TemplateData {
  const locale = normalizeLocale(recipient.locale);
  return {
    tenantName: ctx.tenantName,
    recipientName: recipient.name,
    partnerName: ctx.partnerName,
    amount: formatVnd(BigInt(payload.amount), locale),
  };
}
