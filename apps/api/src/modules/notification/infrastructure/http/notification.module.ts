import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { EMAIL_SENDER } from '../../domain/ports/email-sender.port';
import { EMAIL_RENDERER } from '../../domain/ports/email-renderer.port';
import { NOTIFICATION_LOG_REPOSITORY } from '../../domain/ports/notification-log-repository.port';
import { NOTIFICATION_READER } from '../../domain/ports/notification-reader.port';
import {
  BOOKING_NOTIFICATION_EVENTS,
  LISTING_NOTIFICATION_EVENTS,
  PARTNER_NOTIFICATION_EVENTS,
  PAYOUT_NOTIFICATION_EVENTS,
  TAX_CERTIFICATE_NOTIFICATION_EVENTS,
} from '../../domain/notification-plan';
import { SmtpEmailSender } from '../smtp-email-sender';
import { ReactEmailRenderer } from '../email/react-email.renderer';
import { PrismaNotificationLogRepository } from '../repositories/prisma-notification-log.repository';
import { PrismaNotificationReader } from '../prisma-notification.reader';
import { ReminderWorker } from '../reminder.worker';
import { DispatchBookingEventUseCase } from '../../application/use-cases/dispatch-booking-event.use-case';
import { DispatchListingEventUseCase } from '../../application/use-cases/dispatch-listing-event.use-case';
import { DispatchPartnerEventUseCase } from '../../application/use-cases/dispatch-partner-event.use-case';
import { DispatchPayoutEventUseCase } from '../../application/use-cases/dispatch-payout-event.use-case';
import {
  DispatchLegalDocumentEventUseCase,
  type LegalDocumentPublishedPayload,
} from '../../application/use-cases/dispatch-legal-document-event.use-case';
import {
  DispatchMemberInvitationEventUseCase,
  type MemberInvitationPayload,
} from '../../application/use-cases/dispatch-member-invitation-event.use-case';
import { DispatchReminderUseCase } from '../../application/use-cases/dispatch-reminder.use-case';
import { SendBookingOtpUseCase } from '../../application/use-cases/send-booking-otp.use-case';
import {
  DispatchTaxCertificateEventUseCase,
  type TaxCertificateNotificationPayload,
} from '../../application/use-cases/dispatch-tax-certificate-event.use-case';

/**
 * Notifications (TONG-QUAN.md §17). Every notification is produced from a domain
 * event via the outbox (at-least-once → the dispatcher is idempotent), rendered in
 * the recipient's locale, and sent by email (mailpit in dev; ZNS is Phase 2).
 *
 * Deferred (their producing event isn't emitted yet): BalancePaymentDue and
 * SubscriptionExpiring (T−7d). Booking/auth OTPs are synchronous by design.
 */
@Module({
  imports: [PrismaModule, TenantContextModule],
  providers: [
    { provide: EMAIL_SENDER, useClass: SmtpEmailSender },
    { provide: EMAIL_RENDERER, useClass: ReactEmailRenderer },
    { provide: NOTIFICATION_LOG_REPOSITORY, useClass: PrismaNotificationLogRepository },
    { provide: NOTIFICATION_READER, useClass: PrismaNotificationReader },
    DispatchBookingEventUseCase,
    DispatchListingEventUseCase,
    DispatchPartnerEventUseCase,
    DispatchPayoutEventUseCase,
    DispatchLegalDocumentEventUseCase,
    DispatchMemberInvitationEventUseCase,
    DispatchReminderUseCase,
    SendBookingOtpUseCase,
    DispatchTaxCertificateEventUseCase,
    ReminderWorker,
  ],
  // Exported so the booking module can send the guest-lookup OTP synchronously (§8.6).
  exports: [SendBookingOtpUseCase, EMAIL_SENDER, EMAIL_RENDERER, NOTIFICATION_READER],
})
export class NotificationModule implements OnModuleInit {
  private readonly logger = new Logger(NotificationModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly dispatchBookingEvent: DispatchBookingEventUseCase,
    private readonly dispatchListingEvent: DispatchListingEventUseCase,
    private readonly dispatchPartnerEvent: DispatchPartnerEventUseCase,
    private readonly dispatchPayoutEvent: DispatchPayoutEventUseCase,
    private readonly dispatchLegalDocumentEvent: DispatchLegalDocumentEventUseCase,
    private readonly dispatchMemberInvitationEvent: DispatchMemberInvitationEventUseCase,
    private readonly dispatchTaxCertificateEvent: DispatchTaxCertificateEventUseCase,
  ) {}

  onModuleInit(): void {
    // Task 20 — single event, registered directly (ListingModule:202-225 is the
    // reference shape): a material legal-document publish tells the tenant's active
    // partners/affiliates they have a new version to accept.
    this.registry.register('legal.document_published', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.dispatchLegalDocumentEvent.execute(tenantId, legalDocumentPayloadOf(event.payload));
    });
    // Task 9 — single event, single audience (the invitee), same shape as above.
    this.registry.register('tenant.member_invited', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.dispatchMemberInvitationEvent.execute(tenantId, invitationPayloadOf(event.payload));
    });
    for (const eventType of BOOKING_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchBookingEvent.execute(tenantId, event.eventType, payloadOf(event.payload));
      });
    }
    for (const eventType of LISTING_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchListingEvent.execute(tenantId, event.eventType, payloadOf(event.payload));
      });
    }
    for (const eventType of PARTNER_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchPartnerEvent.execute(tenantId, event.eventType, payloadOf(event.payload));
      });
    }
    for (const eventType of PAYOUT_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchPayoutEvent.execute(tenantId, payoutPayloadOf(event.payload));
      });
    }
    for (const eventType of TAX_CERTIFICATE_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchTaxCertificateEvent.execute(
          tenantId,
          eventType as 'tax.certificate_issued' | 'tax.certificate_voided',
          taxCertificatePayloadOf(event.payload),
        );
      });
    }
  }

  /**
   * A tenant-scoped notification event without a tenant id cannot be routed: skip it
   * (and say so) instead of running `forTenant('')`, which crashes on the RLS policy's
   * uuid cast (`invalid input syntax for type uuid: ""`). Skipping — not throwing —
   * avoids wasting the event's finite retry budget and eventually dead-lettering a
   * structurally invalid row.
   */
  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}

function taxCertificatePayloadOf(payload: unknown): TaxCertificateNotificationPayload {
  return (payload ?? {}) as TaxCertificateNotificationPayload;
}

function legalDocumentPayloadOf(payload: unknown): LegalDocumentPublishedPayload {
  return (payload ?? {}) as LegalDocumentPublishedPayload;
}

function invitationPayloadOf(payload: unknown): MemberInvitationPayload {
  return (payload ?? {}) as MemberInvitationPayload;
}

function payoutPayloadOf(payload: unknown): {
  payoutId: string;
  payeeType: string;
  payeeId: string;
  amount: string;
} {
  return (payload ?? {}) as { payoutId: string; payeeType: string; payeeId: string; amount: string };
}

function payloadOf(payload: unknown): {
  bookingId: string;
  listingId: string;
  partnerId: string;
  status?: string;
  refundAmount?: string;
  reason?: string;
} {
  return (payload ?? {}) as {
    bookingId: string;
    listingId: string;
    partnerId: string;
    status?: string;
    refundAmount?: string;
    reason?: string;
  };
}
