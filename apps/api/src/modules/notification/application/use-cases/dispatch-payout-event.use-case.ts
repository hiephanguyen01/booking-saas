import { Inject, Injectable } from '@nestjs/common';
import { formatVnd } from '../../../../shared/money/money';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { type TemplateData } from '../../domain/email-template';
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
 * payout.paid → the partner's members (§17; affiliate payouts have no Phase-1
 * template). Idempotent via the `notification_logs` dedupe key; a failure rethrows
 * so the outbox relay retries.
 */
@Injectable()
export class DispatchPayoutEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
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
      await deliverNotification(
        { email: this.email, logs: this.logs },
        { tenantId, eventType: 'payout.paid', recipient, item, data, dedupeKey, bookingId: null },
      );
    }
  }
}
