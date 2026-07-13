import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { formatVnd } from '../../../shared/money/money';
import { formatInZone } from '../../../shared/time/time';
import { EMAIL_SENDER, type IEmailSender } from '../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type BookingNotificationContext,
  type INotificationReader,
  type NotificationRecipient,
} from '../domain/ports/notification-reader.port';
import { planForEvent, type NotificationPlanItem } from '../domain/notification-plan';
import { renderEmail, type TemplateData } from '../domain/email-template';

interface BookingEventPayload {
  bookingId: string;
  status?: string;
  refundAmount?: string;
  reason?: string;
}

/**
 * Turns a domain event into emails (§17). Idempotent by design: before sending we
 * check `notification_logs` for a `sent` row keyed by a deterministic dedupe key,
 * so an at-least-once outbox redelivery never sends a second email. One handler
 * failure rethrows so the relay retries — already-sent recipients are skipped.
 */
@Injectable()
export class DispatchNotificationService {
  private readonly logger = new Logger(DispatchNotificationService.name);

  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  /** booking.* events (created/approved/confirmed/cancelled/completed/no_show/rejected). */
  async dispatchBookingEvent(
    tenantId: string,
    eventType: string,
    payload: BookingEventPayload,
  ): Promise<void> {
    const plan = planForEvent(eventType, payload);
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, payload.bookingId),
    );
    if (!ctx) return;

    for (const item of plan) {
      const recipients = this.audienceRecipients(item, ctx);
      for (const recipient of recipients) {
        const dedupeKey = `${eventType}:${ctx.bookingId}:${item.templateId}:${recipient.userId}`;
        await this.deliver(
          tenantId,
          eventType,
          recipient,
          item,
          this.bookingData(ctx, recipient, payload),
          dedupeKey,
          ctx.bookingId,
        );
      }
    }
  }

  /** listing.published / listing.hidden → the owning partner's members. */
  async dispatchListingEvent(
    tenantId: string,
    eventType: string,
    payload: { listingId: string; reason?: string },
  ): Promise<void> {
    const plan = planForEvent(eventType, {});
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadListingContext(tx, payload.listingId),
    );
    if (!ctx) return;
    for (const item of plan) {
      for (const recipient of ctx.partnerRecipients) {
        const dedupeKey = `${eventType}:${payload.listingId}:${item.templateId}:${recipient.userId}`;
        const data: TemplateData = {
          tenantName: ctx.tenantName,
          recipientName: recipient.name,
          listingTitle: ctx.listingTitle,
          reason: payload.reason,
        };
        await this.deliver(tenantId, eventType, recipient, item, data, dedupeKey, null);
      }
    }
  }

  /** payout.paid → the partner's members (affiliate payouts have no Phase-1 template). */
  async dispatchPayoutEvent(
    tenantId: string,
    payload: { payoutId: string; payeeType: string; payeeId: string; amount: string },
  ): Promise<void> {
    if (payload.payeeType !== 'partner') return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.payeeId),
    );
    if (!ctx) return;
    const item: NotificationPlanItem = { audience: 'partner', templateId: 'payout_paid_partner' };
    for (const recipient of ctx.recipients) {
      const locale = recipient.locale === 'en' ? 'en' : 'vi';
      const data: TemplateData = {
        tenantName: ctx.tenantName,
        recipientName: recipient.name,
        partnerName: ctx.partnerName,
        amount: formatVnd(BigInt(payload.amount), locale),
      };
      const dedupeKey = `payout.paid:${payload.payoutId}:${item.templateId}:${recipient.userId}`;
      await this.deliver(tenantId, 'payout.paid', recipient, item, data, dedupeKey, null);
    }
  }

  /**
   * Sends a guest-lookup OTP synchronously (§8.6). The plaintext code exists only
   * at issue time and is never persisted, so it cannot ride the async outbox — the
   * booking use-case calls this directly. No dedupe (each request resends a fresh
   * code); best-effort — a send failure is logged, not thrown (the code stays valid
   * in Redis, so the guest can retry).
   */
  async sendBookingOtp(
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

  /** partner.approved → the partner's members. */
  async dispatchPartnerEvent(
    tenantId: string,
    eventType: string,
    payload: { partnerId: string },
  ): Promise<void> {
    const plan = planForEvent(eventType, {});
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.partnerId),
    );
    if (!ctx) return;
    for (const item of plan) {
      for (const recipient of ctx.recipients) {
        const dedupeKey = `${eventType}:${payload.partnerId}:${item.templateId}:${recipient.userId}`;
        const data: TemplateData = {
          tenantName: ctx.tenantName,
          recipientName: recipient.name,
          partnerName: ctx.partnerName,
        };
        await this.deliver(tenantId, eventType, recipient, item, data, dedupeKey, null);
      }
    }
  }

  /** Reminder job → the booking's customer (T−24h). */
  async dispatchReminder(tenantId: string, bookingId: string): Promise<void> {
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, bookingId),
    );
    if (!ctx?.customer) return;
    const item: NotificationPlanItem = {
      audience: 'customer',
      templateId: 'booking_reminder_customer',
    };
    const dedupeKey = `booking.reminder:${bookingId}:${ctx.customer.userId}`;
    await this.deliver(
      tenantId,
      'booking.reminder',
      ctx.customer,
      item,
      this.bookingData(ctx, ctx.customer, {}),
      dedupeKey,
      bookingId,
    );
  }

  private audienceRecipients(
    item: NotificationPlanItem,
    ctx: BookingNotificationContext,
  ): NotificationRecipient[] {
    if (item.audience === 'customer') return ctx.customer ? [ctx.customer] : [];
    return ctx.partnerRecipients;
  }

  private bookingData(
    ctx: BookingNotificationContext,
    recipient: NotificationRecipient,
    payload: { refundAmount?: string; reason?: string },
  ): TemplateData {
    const locale = recipient.locale === 'en' ? 'en' : 'vi';
    return {
      tenantName: ctx.tenantName,
      recipientName: recipient.name,
      bookingCode: ctx.code,
      listingTitle: ctx.listingTitle,
      partnerName: ctx.partnerName,
      startsAt: formatInZone(ctx.startUtc, ctx.timezone, locale),
      amount: formatVnd(ctx.finalAmount, locale),
      refundAmount: formatVnd(payload.refundAmount ? BigInt(payload.refundAmount) : 0n, locale),
      reason: payload.reason,
    };
  }

  private async deliver(
    tenantId: string,
    eventType: string,
    recipient: NotificationRecipient,
    item: NotificationPlanItem,
    data: TemplateData,
    dedupeKey: string,
    bookingId: string | null,
  ): Promise<void> {
    if (await this.logs.alreadySent(dedupeKey)) return;
    const content = renderEmail(item.templateId, recipient.locale, data);
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
        eventType,
        recipient: recipient.email,
        status: 'sent',
        dedupeKey,
        payload: { templateId: item.templateId, bookingId, subject: content.subject },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`email ${item.templateId} → ${recipient.email} failed: ${message}`);
      await this.logs.record({
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
}
