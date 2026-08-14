import { Logger } from '@nestjs/common';
import type { EmailBrand, TemplateData } from '../domain/email-template';
import type { NotificationDelivery } from '../domain/entities/notification-delivery.entity';
import { IN_APP_TEMPLATES } from '../domain/in-app-templates';
import type { IEmailRenderer } from '../domain/ports/email-renderer.port';
import type { IEmailSender } from '../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../domain/ports/notification-log-repository.port';
import type { InboxCollector } from './inbox-collector';

const logger = new Logger('NotificationDelivery');

/** The ports a delivery needs — injected by the calling use-case and passed through. */
export interface DeliveryPorts {
  email: IEmailSender;
  logs: INotificationLogRepository;
  renderer: IEmailRenderer;
  /** Absent on the synchronous OTP path, which never produces a bell row. */
  inbox?: InboxCollector;
}

/**
 * Renders + sends one email and records the outcome in `notification_logs` (§17).
 * The single delivery path for BOTH the outbox dispatchers and the synchronous OTP —
 * their differences live in the aggregate's {@link DeliveryPolicy}, not in duplicated
 * code: outbox deliveries skip an already-sent key and rethrow on failure so the relay
 * retries; the OTP always sends and swallows failures.
 *
 * Log writes are deliberately outside any business transaction — an email send is not
 * transactional, and a rolled-back `sent` row would mean a duplicate email on retry.
 */
export async function deliverNotification(
  ports: DeliveryPorts,
  delivery: NotificationDelivery,
  input: { locale: string; brand: EmailBrand; data: TemplateData },
): Promise<void> {
  const { dedupe, onFailure } = delivery.policy;
  // ⚠️ ORDER IS LOAD-BEARING. This sits BEFORE the dedupe gate below, which
  // returns early. If the row were collected after it, this would happen:
  // first delivery sends the email, the process dies before the flush, the
  // outbox redelivers, `alreadySent` is now true, we return at the gate — and
  // the email arrived while the bell row never existed. Outbox delivery is
  // at-least-once precisely because processes die. The unique index on
  // (user_id, dedupe_key) makes collecting on every redelivery harmless.
  const inApp = IN_APP_TEMPLATES[delivery.templateId];
  if (inApp && ports.inbox && delivery.userId) {
    ports.inbox.add({
      tenantId: delivery.tenantId,
      userId: delivery.userId,
      area: inApp.area,
      eventType: delivery.eventType,
      title: inApp.title,
      body: null,
      targetType: inApp.targetType,
      targetId: inApp.targetId === 'booking' ? delivery.bookingId : null,
      dedupeKey: delivery.dedupeKey,
    });
  }
  if (dedupe && (await ports.logs.alreadySent(delivery.dedupeKey))) return;
  const content = await ports.renderer.render(
    delivery.templateId,
    input.locale,
    input.brand,
    input.data,
  );
  try {
    await ports.email.send({
      to: delivery.recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      attachments: content.attachments,
    });
    delivery.markSent(content.subject, new Date());
    await ports.logs.record(delivery.logEntry());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`email ${delivery.templateId} → ${delivery.recipientEmail} failed: ${message}`);
    delivery.markFailed(message);
    await ports.logs.record(delivery.logEntry());
    if (onFailure === 'rethrow') throw error; // let the outbox relay retry
  }
}
