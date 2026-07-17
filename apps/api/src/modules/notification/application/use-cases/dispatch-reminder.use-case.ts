import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { bookingTemplateData } from '../../domain/booking-notification-data';
import { type NotificationPlanItem } from '../../domain/notification-plan';
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

/**
 * Reminder job → the booking's customer (§17 BookingReminder T−24h). Idempotent
 * via the `notification_logs` dedupe key, so overlapping poll sweeps never resend;
 * a failure rethrows so the sweep can log it.
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
    const item: NotificationPlanItem = {
      audience: 'customer',
      templateId: 'booking_reminder_customer',
    };
    const dedupeKey = `booking.reminder:${bookingId}:${ctx.customer.userId}`;
    await deliverNotification(
      { email: this.email, logs: this.logs },
      {
        tenantId,
        eventType: 'booking.reminder',
        recipient: ctx.customer,
        item,
        data: bookingTemplateData(ctx, ctx.customer, {}),
        dedupeKey,
        bookingId,
      },
    );
  }
}
