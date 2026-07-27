import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { type TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OTP_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
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
 * Sends a guest-lookup OTP synchronously (§8.6). The plaintext code exists only at
 * issue time and is never persisted, so it cannot ride the async outbox — the booking
 * use-case calls this directly. Its {@link OTP_DELIVERY_POLICY} says it all: never
 * deduped (each request must reach the guest, even for a resent code) and never throws
 * (the code stays valid in Redis, so the guest can retry).
 */
@Injectable()
export class SendBookingOtpUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    otp: string,
    expiresInSec: number,
  ): Promise<void> {
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, bookingId),
    );
    if (!ctx?.customer) return;
    const recipient = ctx.customer;
    const data: TemplateData = {
      tenantName: ctx.tenantName,
      recipientName: recipient.name,
      bookingCode: ctx.code,
      otp,
      expiresInMin: Math.max(1, Math.round(expiresInSec / 60)),
    };
    const delivery = NotificationDelivery.start({
      tenantId,
      userId: recipient.userId,
      recipientEmail: recipient.email,
      eventType: 'booking.otp',
      templateId: 'booking_otp_customer',
      dedupeKey: DedupeKey.forOtp(bookingId, recipient.userId, otp),
      bookingId,
      policy: OTP_DELIVERY_POLICY,
    });
    await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
      locale: recipient.locale,
      data,
    });
  }
}
