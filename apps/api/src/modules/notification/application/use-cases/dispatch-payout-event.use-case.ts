import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForPayout } from '../../domain/notification-plan';
import { payoutTemplateData } from '../../domain/payout-notification-data';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import { EMAIL_RENDERER, type IEmailRenderer } from '../../domain/ports/email-renderer.port';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';
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
import { InboxCollector } from '../inbox-collector';

/**
 * payout.paid → the partner's members (§17; affiliate payouts have no Phase-1
 * template — see `planForPayout`). Idempotent via the delivery dedupe key; a failure
 * rethrows so the outbox relay retries.
 */
@Injectable()
export class DispatchPayoutEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    payload: { payoutId: string; payeeType: string; payeeId: string; amount: string },
  ): Promise<void> {
    const plan = planForPayout(payload);
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.payeeId),
    );
    if (!ctx) return;
    const collector = new InboxCollector();
    for (const item of plan) {
      for (const recipient of ctx.recipients) {
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType: 'payout.paid',
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            'payout.paid',
            payload.payoutId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: null,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification(
          { email: this.email, logs: this.logs, renderer: this.renderer, inbox: collector },
          delivery,
          {
            locale: recipient.locale,
            brand: ctx.brand,
            data: payoutTemplateData(ctx, recipient, payload),
          },
        );
      }
    }
    if (!collector.isEmpty()) {
      await this.tenantDb.forTenant(tenantId, (tx) => this.inbox.insertMany(tx, collector.rows()));
    }
  }
}
