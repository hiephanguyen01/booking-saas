import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { audienceRecipients, bookingTemplateData } from '../../domain/booking-notification-data';
import { planForEvent } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { deliverNotification } from '../deliver-notification';

export interface BookingEventPayload {
  bookingId: string;
  status?: string;
  refundAmount?: string;
  reason?: string;
}

/**
 * booking.* events (created/approved/confirmed/cancelled/completed/no_show/rejected)
 * → emails (§17). Idempotent by design: before sending we check `notification_logs`
 * for a `sent` row keyed by a deterministic dedupe key, so an at-least-once outbox
 * redelivery never sends a second email. One delivery failure rethrows so the relay
 * retries — already-sent recipients are skipped.
 */
@Injectable()
export class DispatchBookingEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, eventType: string, payload: BookingEventPayload): Promise<void> {
    const plan = planForEvent(eventType, payload);
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, payload.bookingId),
    );
    if (!ctx) return;

    for (const item of plan) {
      const recipients = audienceRecipients(item, ctx);
      for (const recipient of recipients) {
        const dedupeKey = `${eventType}:${ctx.bookingId}:${item.templateId}:${recipient.userId}`;
        await deliverNotification(
          { email: this.email, logs: this.logs },
          {
            tenantId,
            eventType,
            recipient,
            item,
            data: bookingTemplateData(ctx, recipient, payload),
            dedupeKey,
            bookingId: ctx.bookingId,
          },
        );
      }
    }
  }
}
