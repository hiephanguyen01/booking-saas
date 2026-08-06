import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { audienceRecipients, bookingTemplateData } from '../../domain/booking-notification-data';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForEvent } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import { EMAIL_RENDERER, type IEmailRenderer } from '../../domain/ports/email-renderer.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key.value-object';
import { deliverNotification } from '../deliver-notification';

export interface BookingEventPayload {
  bookingId: string;
  status?: string;
  refundAmount?: string;
  refundPercent?: number;
  reason?: string;
  /** Set by the scheduler's post-grace sweep, never by a partner/tenant action. */
  auto?: boolean;
}

/**
 * booking.* events (created/approved/confirmed/cancelled/completed/no_show/rejected)
 * → emails (§17). Idempotent by design: the delivery's dedupe key skips a resend, so
 * an at-least-once outbox redelivery never sends a second email. One delivery failure
 * rethrows so the relay retries — already-sent recipients are skipped.
 */
@Injectable()
export class DispatchBookingEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
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
      for (const recipient of audienceRecipients(item, ctx)) {
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType,
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            eventType,
            ctx.bookingId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: ctx.bookingId,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification({ email: this.email, logs: this.logs, renderer: this.renderer }, delivery, {
          locale: recipient.locale,
          brand: ctx.brand,
          data: bookingTemplateData(ctx, recipient, payload, item.templateId),
        });
      }
    }
  }
}
