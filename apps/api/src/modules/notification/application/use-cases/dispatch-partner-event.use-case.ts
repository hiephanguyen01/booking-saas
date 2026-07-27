import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { type TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
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
import { DedupeKey } from '../../domain/value-objects/dedupe-key.value-object';
import { deliverNotification } from '../deliver-notification';

/**
 * partner.approved → the partner's members (§17). Idempotent via the delivery dedupe
 * key; a failure rethrows so the outbox relay retries.
 */
@Injectable()
export class DispatchPartnerEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, eventType: string, payload: { partnerId: string }): Promise<void> {
    const plan = planForEvent(eventType, {});
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.partnerId),
    );
    if (!ctx) return;
    for (const item of plan) {
      for (const recipient of ctx.recipients) {
        const data: TemplateData = {
          tenantName: ctx.tenantName,
          recipientName: recipient.name,
          partnerName: ctx.partnerName,
        };
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType,
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            eventType,
            payload.partnerId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: null,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
          locale: recipient.locale,
          data,
        });
      }
    }
  }
}
