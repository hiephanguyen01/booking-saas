import { Logger } from '@nestjs/common';
import type { EmailBrand, TemplateData } from '../domain/email-template';
import type { NotificationDelivery } from '../domain/entities/notification-delivery.entity';
import type { IEmailRenderer } from '../domain/ports/email-renderer.port';
import type { IEmailSender } from '../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../domain/ports/notification-log-repository.port';

const logger = new Logger('NotificationDelivery');

/** The ports a delivery needs — injected by the calling use-case and passed through. */
export interface DeliveryPorts {
  email: IEmailSender;
  logs: INotificationLogRepository;
  renderer: IEmailRenderer;
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
