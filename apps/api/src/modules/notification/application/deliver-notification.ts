import { Logger } from '@nestjs/common';
import { renderEmail, type TemplateData } from '../domain/email-template';
import type { NotificationPlanItem } from '../domain/notification-plan';
import type { IEmailSender } from '../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../domain/ports/notification-log-repository.port';
import type { NotificationRecipient } from '../domain/ports/notification-reader.port';

const logger = new Logger('NotificationDelivery');

/** The ports a delivery needs — injected by the calling use-case and passed through. */
export interface DeliveryPorts {
  email: IEmailSender;
  logs: INotificationLogRepository;
}

export interface NotificationDelivery {
  tenantId: string;
  eventType: string;
  recipient: NotificationRecipient;
  item: NotificationPlanItem;
  data: TemplateData;
  dedupeKey: string;
  bookingId: string | null;
}

/**
 * Renders + sends one email and records the outcome in `notification_logs` (§17).
 * Idempotent by design: a `sent` row keyed by the deterministic dedupe key skips
 * the send, so an at-least-once outbox redelivery never sends a second email.
 * A send failure is recorded then rethrown so the relay retries.
 */
export async function deliverNotification(
  ports: DeliveryPorts,
  delivery: NotificationDelivery,
): Promise<void> {
  const { tenantId, eventType, recipient, item, data, dedupeKey, bookingId } = delivery;
  if (await ports.logs.alreadySent(dedupeKey)) return;
  const content = renderEmail(item.templateId, recipient.locale, data);
  try {
    await ports.email.send({
      to: recipient.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    await ports.logs.record({
      tenantId,
      userId: recipient.userId,
      channel: 'email',
      eventType,
      recipient: recipient.email,
      status: 'sent',
      dedupeKey,
      payload: { templateId: item.templateId, bookingId, subject: content.subject },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`email ${item.templateId} → ${recipient.email} failed: ${message}`);
    await ports.logs.record({
      tenantId,
      userId: recipient.userId,
      channel: 'email',
      eventType,
      recipient: recipient.email,
      status: 'failed',
      dedupeKey,
      error: message,
      payload: { templateId: item.templateId, bookingId },
    });
    throw error; // let the outbox relay retry
  }
}
