import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { bookingTemplateData } from '../../domain/booking-notification-data';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { REMINDER_PLAN_ITEM } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
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

/**
 * Reminder job → the booking's customer (§17 BookingReminder T−24h). Idempotent via
 * the delivery dedupe key, so overlapping poll sweeps never resend; a failure rethrows
 * so the sweep can log it.
 */
@Injectable()
export class DispatchReminderUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, bookingId),
    );
    if (!ctx?.customer) return;
    const customer = ctx.customer;
    const delivery = NotificationDelivery.start({
      tenantId,
      userId: customer.userId,
      recipientEmail: customer.email,
      eventType: 'booking.reminder',
      templateId: REMINDER_PLAN_ITEM.templateId,
      dedupeKey: DedupeKey.forReminder(bookingId, customer.userId),
      bookingId,
      policy: OUTBOX_DELIVERY_POLICY,
    });
    await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
      locale: customer.locale,
      data: bookingTemplateData(ctx, customer, {}),
    });
  }
}
