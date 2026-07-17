import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { renderEmail, type TemplateData } from '../../domain/email-template';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';

/**
 * Sends a guest-lookup OTP synchronously (§8.6). The plaintext code exists only
 * at issue time and is never persisted, so it cannot ride the async outbox — the
 * booking use-case calls this directly. No dedupe (each request resends a fresh
 * code); best-effort — a send failure is logged, not thrown (the code stays valid
 * in Redis, so the guest can retry).
 */
@Injectable()
export class SendBookingOtpUseCase {
  private readonly logger = new Logger(SendBookingOtpUseCase.name);

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
    const content = renderEmail('booking_otp_customer', recipient.locale, data);
    const dedupeKey = `booking.otp:${bookingId}:${recipient.userId}:${otp}`;
    try {
      await this.email.send({
        to: recipient.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      await this.logs.record({
        tenantId,
        userId: recipient.userId,
        channel: 'email',
        eventType: 'booking.otp',
        recipient: recipient.email,
        status: 'sent',
        dedupeKey,
        payload: { templateId: 'booking_otp_customer', bookingId, subject: content.subject },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OTP email → ${recipient.email} failed: ${message}`);
      await this.logs.record({
        tenantId,
        userId: recipient.userId,
        channel: 'email',
        eventType: 'booking.otp',
        recipient: recipient.email,
        status: 'failed',
        dedupeKey,
        error: message,
        payload: { templateId: 'booking_otp_customer', bookingId },
      });
    }
  }
}
