import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { formatVnd } from '../../../../shared/money/money';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { normalizeLocale, type TemplateData } from '../../domain/email-template';
import type { NotificationTemplateId } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import { EMAIL_RENDERER, type IEmailRenderer } from '../../domain/ports/email-renderer.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type BookingNotificationContext,
  type INotificationReader,
  type NotificationRecipient,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key.value-object';
import { deliverNotification } from '../deliver-notification';

export interface ManualRefundNotificationPayload {
  refundBatchId: string;
  hours?: 24 | 48;
}

@Injectable()
export class DispatchManualRefundEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(EMAIL_RENDERER) private readonly renderer: IEmailRenderer,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    eventType: string,
    payload: ManualRefundNotificationPayload,
  ): Promise<void> {
    const templateId = templateFor(eventType, payload.hours);
    if (!templateId || !isUuid(payload.refundBatchId)) return;

    const context = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadManualRefundBookingContext(tx, payload.refundBatchId),
    );
    const customer = context?.customer;
    if (!context || !customer) return;

    const completion = eventType === 'refund.completed';
    const delivery = NotificationDelivery.start({
      tenantId,
      userId: customer.userId,
      recipientEmail: customer.email,
      eventType,
      templateId,
      dedupeKey: completion
        ? DedupeKey.forEvent(
            'booking.refunded',
            context.bookingId,
            'booking_refunded_customer',
            customer.userId,
          )
        : DedupeKey.forEvent(eventType, payload.refundBatchId, templateId, customer.userId),
      bookingId: context.bookingId,
      policy: OUTBOX_DELIVERY_POLICY,
    });
    await deliverNotification(
      { email: this.email, logs: this.logs, renderer: this.renderer },
      delivery,
      {
        locale: customer.locale,
        brand: context.brand,
        data: manualRefundTemplateData(context, customer),
      },
    );
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function templateFor(
  eventType: string,
  hours?: 24 | 48,
): NotificationTemplateId | null {
  switch (eventType) {
    case 'manual_refund.destination_requested':
      return 'manual_refund_destination_requested_customer';
    case 'manual_refund.customer_details_reminder':
      return hours === 24
        ? 'manual_refund_details_reminder_24_customer'
        : hours === 48
          ? 'manual_refund_details_reminder_48_customer'
          : null;
    case 'manual_refund.destination_ready':
      return 'manual_refund_destination_ready_customer';
    case 'manual_refund.transfer_submitted':
      return 'manual_refund_transfer_submitted_customer';
    case 'manual_refund.customer_not_received':
      return 'manual_refund_not_received_customer';
    case 'refund.completed':
      return 'manual_refund_completed_customer';
    default:
      return null;
  }
}

function manualRefundTemplateData(
  context: BookingNotificationContext,
  customer: NotificationRecipient,
): TemplateData {
  const locale = normalizeLocale(customer.locale);
  const refundAmount = context.refundDueAmount ?? context.refundedAmount;
  return {
    tenantName: context.tenantName,
    recipientName: customer.name,
    bookingCode: context.code,
    listingTitle: context.listingTitle,
    refundAmount: refundAmount > 0n ? formatVnd(refundAmount, locale) : undefined,
    ctaUrl: `${context.brand.storefrontUrl ?? 'http://localhost:5173'}/${locale}/bookings/${encodeURIComponent(context.code)}`,
  };
}
