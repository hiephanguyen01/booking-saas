import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type {
  BookingNotificationContext,
  INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DispatchReminderUseCase } from './dispatch-reminder.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const CUSTOMER = { userId: 'user-1', email: 'khach@x.vn', name: 'Khách', locale: 'vi' };

const context = (overrides: Record<string, unknown> = {}): BookingNotificationContext =>
  ({
    bookingId: BOOKING_ID,
    code: 'BK-2026-0001',
    listingTitle: 'Sân bóng số 1',
    tenantName: 'StudioHub',
    partnerName: 'Studio Giang',
    bookingMode: 'hourly',
    quantity: 1,
    startUtc: new Date('2026-09-10T02:00:00Z'),
    endUtc: new Date('2026-09-10T04:00:00Z'),
    timezone: 'Asia/Ho_Chi_Minh',
    totalAmount: 1_000_000n,
    finalAmount: 1_000_000n,
    discountAmount: 0n,
    depositAmount: 0n,
    paidAmount: 0n,
    refundedAmount: 0n,
    refundDueAmount: null,
    refundPercent: null,
    pricingSnapshot: null,
    cancellationPolicySnapshot: null,
    brand: { storefrontUrl: 'https://studiohub.vn' },
    customer: CUSTOMER,
    partnerRecipients: [{ userId: 'u2', email: 'giang@x.vn', name: 'Giang', locale: 'vi' }],
    ...overrides,
  }) as unknown as BookingNotificationContext;

interface Options {
  ctx?: BookingNotificationContext | null;
  alreadySent?: boolean;
  sendError?: Error;
}

function harness(options: Options = {}) {
  const sent: Array<{ to: string }> = [];
  const dedupeKeys: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchReminderUseCase(
      fakePort<INotificationReader>({
        loadBookingContext: () =>
          Promise.resolve(options.ctx === undefined ? context() : options.ctx),
      }),
      fakePort<IEmailSender>({
        send: (m) => {
          sent.push(m as unknown as { to: string });
          return options.sendError ? Promise.reject(options.sendError) : Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: () => Promise.resolve({ subject: 's', text: 't', html: '<p>t</p>' }),
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (k) => {
          dedupeKeys.push(k);
          return Promise.resolve(options.alreadySent ?? false);
        },
        record: () => Promise.resolve(),
      }),
      tenantDb.service,
    ),
    tenantDb,
    sent,
    dedupeKeys,
  };
}

describe('DispatchReminderUseCase', () => {
  it('reminds the CUSTOMER only — the partner already knows', async () => {
    const { useCase, sent, tenantDb } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(sent.map((s) => s.to)).toEqual([CUSTOMER.email]);
  });

  it('sends nothing for a booking that is gone or has no customer', async () => {
    const gone = harness({ ctx: null });
    const noCustomer = harness({ ctx: context({ customer: null }) });

    await gone.useCase.execute(TENANT_ID, BOOKING_ID);
    await noCustomer.useCase.execute(TENANT_ID, BOOKING_ID);

    expect(gone.sent).toEqual([]);
    expect(noCustomer.sent).toEqual([]);
  });

  it('DEDUPES per booking and customer, so the sweep can run repeatedly', async () => {
    // The T−24h sweep re-runs on a schedule; without this a customer would be
    // reminded on every pass.
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(dedupeKeys).toEqual([`booking.reminder:${BOOKING_ID}:${CUSTOMER.userId}`]);
  });

  it('sends nothing when it has already reminded this customer', async () => {
    const { useCase, sent } = harness({ alreadySent: true });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(sent).toEqual([]);
  });

  it('RETHROWS a send failure so the sweep retries', async () => {
    const { useCase } = harness({ sendError: new Error('smtp down') });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toThrow('smtp down');
  });
});
