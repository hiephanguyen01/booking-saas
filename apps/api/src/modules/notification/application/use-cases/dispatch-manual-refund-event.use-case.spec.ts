import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type {
  BookingNotificationContext,
  INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DispatchManualRefundEventUseCase } from './dispatch-manual-refund-event.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = {
  userId: '99999999-9999-4999-8999-999999999999',
  email: 'customer@example.test',
  name: 'Test Customer',
  locale: 'vi',
};

function bookingContext(
  overrides: Partial<BookingNotificationContext> = {},
): BookingNotificationContext {
  return {
    bookingId: BOOKING_ID,
    code: 'BK-REFUND-01',
    status: 'cancelled',
    listingTitle: 'Canary listing',
    listingImageUrl: null,
    tenantName: 'Canary tenant',
    partnerName: 'Canary partner',
    providerAddress: null,
    providerPhone: null,
    bookingMode: 'hourly',
    quantity: 1,
    startUtc: new Date('2026-09-01T01:00:00.000Z'),
    endUtc: new Date('2026-09-01T02:00:00.000Z'),
    timezone: 'Asia/Ho_Chi_Minh',
    listingAddress: null,
    totalAmount: 10_000n,
    finalAmount: 10_000n,
    discountAmount: 0n,
    depositAmount: 10_000n,
    paidAmount: 10_000n,
    refundedAmount: 0n,
    refundDueAmount: 10_000n,
    refundPercent: 100,
    pricingSnapshot: null,
    paymentGateway: 'sepay',
    paymentMethod: 'bank_transfer',
    customerNote: null,
    cancellationPolicySnapshot: null,
    brand: {
      name: 'Canary tenant',
      primaryColor: '#6941C6',
      storefrontUrl: 'https://canary.example.test',
      dashboardUrl: 'https://admin.canary.example.test',
    },
    customer: CUSTOMER,
    partnerRecipients: [],
    ...overrides,
  };
}

function harness(context: BookingNotificationContext | null = bookingContext()) {
  const rendered: Array<{ templateId: string; data: unknown }> = [];
  const sent: Array<{ to: string }> = [];
  const dedupeKeys: string[] = [];
  const recorded: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchManualRefundEventUseCase(
      fakePort<INotificationReader>({
        loadManualRefundBookingContext: (_tx, refundBatchId) => {
          expect(refundBatchId).toBe(BATCH_ID);
          return Promise.resolve(context);
        },
      }),
      fakePort<IEmailSender>({
        send: (message) => {
          sent.push(message as unknown as { to: string });
          return Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (templateId, _locale, _brand, data) => {
          rendered.push({ templateId, data });
          return Promise.resolve({ subject: 'safe', text: 'safe', html: '<p>safe</p>' });
        },
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (key) => {
          dedupeKeys.push(key);
          return Promise.resolve(false);
        },
        record: (entry) => {
          recorded.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    rendered,
    sent,
    dedupeKeys,
    recorded,
  };
}

describe('DispatchManualRefundEventUseCase', () => {
  it('maps each customer-visible state to a safe email template', async () => {
    const test = harness();
    const events = [
      ['manual_refund.destination_requested', undefined],
      ['manual_refund.customer_details_reminder', 24],
      ['manual_refund.customer_details_reminder', 48],
      ['manual_refund.destination_ready', undefined],
      ['manual_refund.transfer_submitted', undefined],
      ['manual_refund.customer_not_received', undefined],
      ['refund.completed', undefined],
    ] as const;

    for (const [eventType, hours] of events) {
      await test.useCase.execute(TENANT_ID, eventType, {
        refundBatchId: BATCH_ID,
        ...(hours ? { hours } : {}),
        destinationAccountCiphertext: 'secret-ciphertext',
        destinationAccountFingerprint: 'f'.repeat(64),
        evidenceObjectKey: 'private/receipt.pdf',
      } as never);
    }

    expect(test.rendered.map((item) => item.templateId)).toEqual([
      'manual_refund_destination_requested_customer',
      'manual_refund_details_reminder_24_customer',
      'manual_refund_details_reminder_48_customer',
      'manual_refund_destination_ready_customer',
      'manual_refund_transfer_submitted_customer',
      'manual_refund_not_received_customer',
      'manual_refund_completed_customer',
    ]);
    expect(test.sent.map((message) => message.to)).toEqual(Array(7).fill(CUSTOMER.email));
    expect(test.tenantDb.openedFor).toEqual(Array(7).fill(TENANT_ID));

    const observableOutput = JSON.stringify({
      rendered: test.rendered,
      recorded: test.recorded,
    });
    expect(observableOutput).not.toContain('secret-ciphertext');
    expect(observableOutput).not.toContain('f'.repeat(64));
    expect(observableOutput).not.toContain('private/receipt.pdf');
  });

  it('dedupes 24h and 48h separately and shares completion identity with booking.refunded', async () => {
    const test = harness();

    await test.useCase.execute(TENANT_ID, 'manual_refund.customer_details_reminder', {
      refundBatchId: BATCH_ID,
      hours: 24,
    });
    await test.useCase.execute(TENANT_ID, 'manual_refund.customer_details_reminder', {
      refundBatchId: BATCH_ID,
      hours: 48,
    });
    await test.useCase.execute(TENANT_ID, 'refund.completed', { refundBatchId: BATCH_ID });

    expect(test.dedupeKeys).toEqual([
      `manual_refund.customer_details_reminder:${BATCH_ID}:manual_refund_details_reminder_24_customer:${CUSTOMER.userId}`,
      `manual_refund.customer_details_reminder:${BATCH_ID}:manual_refund_details_reminder_48_customer:${CUSTOMER.userId}`,
      `booking.refunded:${BOOKING_ID}:booking_refunded_customer:${CUSTOMER.userId}`,
    ]);
  });

  it('does nothing for an unknown event, missing manual batch, or missing customer', async () => {
    const unknown = harness();
    await unknown.useCase.execute(TENANT_ID, 'manual_refund.unknown', {
      refundBatchId: BATCH_ID,
    });
    expect(unknown.tenantDb.openedFor).toEqual([]);
    expect(unknown.sent).toEqual([]);

    const missing = harness(null);
    await missing.useCase.execute(TENANT_ID, 'manual_refund.destination_requested', {
      refundBatchId: BATCH_ID,
    });
    expect(missing.sent).toEqual([]);

    const noCustomer = harness(bookingContext({ customer: null }));
    await noCustomer.useCase.execute(TENANT_ID, 'manual_refund.destination_ready', {
      refundBatchId: BATCH_ID,
    });
    expect(noCustomer.sent).toEqual([]);
  });

  it('ignores legacy refund completion events that do not carry a refund batch id', async () => {
    const test = harness();

    await expect(
      test.useCase.execute(TENANT_ID, 'refund.completed', {} as never),
    ).resolves.toBeUndefined();

    expect(test.tenantDb.openedFor).toEqual([]);
    expect(test.sent).toEqual([]);
  });
});
