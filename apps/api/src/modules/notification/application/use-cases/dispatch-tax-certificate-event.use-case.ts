import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import type { NotificationTemplateId } from '../../domain/notification-plan';
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

export interface TaxCertificateNotificationPayload {
  certificateId: string;
  partnerId: string;
  taxYear: number;
  certificateNumber: string | null;
  reason?: string;
}

@Injectable()
export class DispatchTaxCertificateEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    eventType: 'tax.certificate_issued' | 'tax.certificate_voided',
    payload: TaxCertificateNotificationPayload,
  ): Promise<void> {
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.partnerId),
    );
    if (!ctx) return;
    const templateId: NotificationTemplateId =
      eventType === 'tax.certificate_issued'
        ? 'tax_certificate_issued_partner'
        : 'tax_certificate_voided_partner';
    for (const recipient of ctx.recipients) {
      const delivery = NotificationDelivery.start({
        tenantId,
        userId: recipient.userId,
        recipientEmail: recipient.email,
        eventType,
        templateId,
        dedupeKey: DedupeKey.forEvent(
          eventType,
          payload.certificateId,
          templateId,
          recipient.userId,
        ),
        bookingId: null,
        policy: OUTBOX_DELIVERY_POLICY,
      });
      await deliverNotification(
        { email: this.email, logs: this.logs, renderer: this.renderer },
        delivery,
        {
          locale: recipient.locale,
          brand: ctx.brand,
          data: {
            tenantName: ctx.tenantName,
            partnerName: ctx.partnerName,
            recipientName: recipient.name,
            taxYear: payload.taxYear,
            certificateNumber: payload.certificateNumber ?? '—',
            reason: payload.reason,
            ctaUrl: `${ctx.brand.dashboardUrl.replace(/\/+$/, '')}/partner/revenue`,
          },
        },
      );
    }
  }
}
