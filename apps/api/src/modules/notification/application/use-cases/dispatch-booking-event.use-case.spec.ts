import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type {
  BookingNotificationContext,
  INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DispatchBookingEventUseCase } from './dispatch-booking-event.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

const CUSTOMER = {
  userId: 'user-customer',
  email: 'khach@studiohub.vn',
  name: 'Khách',
  locale: 'vi',
};
const PARTNER_STAFF = {
  userId: 'user-partner',
  email: 'giang@giangstudio.vn',
  name: 'Giang',
  locale: 'vi',
};

const context = (overrides: Record<string, unknown> = {}): BookingNotificationContext =>
  ({
    bookingId: BOOKING_ID,
    code: 'BK-2026-0001',
    status: 'confirmed',
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
    partnerRecipients: [PARTNER_STAFF],
    ...overrides,
  }) as unknown as BookingNotificationContext;

interface Options {
  ctx?: BookingNotificationContext | null;
  alreadySent?: boolean;
  sendError?: Error;
}

function harness(options: Options = {}) {
  const sent: Array<{ to: string }> = [];
  const rendered: Array<{ templateId: string; locale: string }> = [];
  const inboxWrites: unknown[][] = [];
  const dedupeKeys: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchBookingEventUseCase(
      fakePort<INotificationReader>({
        loadBookingContext: () =>
          Promise.resolve(options.ctx === undefined ? context() : options.ctx),
      }),
      fakePort<IEmailSender>({
        send: (message) => {
          sent.push(message as unknown as { to: string });
          return options.sendError ? Promise.reject(options.sendError) : Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (templateId, locale) => {
          rendered.push({ templateId, locale: locale ?? '' });
          return Promise.resolve({ subject: 's', text: 't', html: '<p>t</p>' });
        },
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (key) => {
          dedupeKeys.push(key);
          return Promise.resolve(options.alreadySent ?? false);
        },
        record: () => Promise.resolve(),
      }),
      fakePort<INotificationInboxRepository>({
        insertMany: (_tx, rows) => {
          inboxWrites.push(rows as unknown[]);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    sent,
    rendered,
    inboxWrites,
    dedupeKeys,
  };
}

describe('DispatchBookingEventUseCase', () => {
  it('does NOTHING for an event with no plan, without reading the booking', async () => {
    // The relay hands every booking event here; loading a context for events
    // nobody is notified about would cost a query per event.
    const { useCase, tenantDb, sent } = harness();

    await useCase.execute(TENANT_ID, 'booking.something_else', { bookingId: BOOKING_ID } as never);

    expect(tenantDb.openedFor).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('sends nothing for a booking that no longer exists', async () => {
    const { useCase, sent } = harness({ ctx: null });

    await useCase.execute(TENANT_ID, 'booking.approved', { bookingId: BOOKING_ID } as never);

    expect(sent).toEqual([]);
  });

  it('notifies BOTH audiences on a confirmation', async () => {
    const { useCase, sent, rendered } = harness();

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never);

    expect(rendered.map((r) => r.templateId)).toEqual([
      'booking_confirmed_customer',
      'booking_confirmed_partner',
    ]);
    expect(sent.map((s) => s.to)).toEqual([CUSTOMER.email, PARTNER_STAFF.email]);
  });

  it('notifies the partner only when a creation NEEDS approval', async () => {
    const needsApproval = harness();
    const autoConfirmed = harness();

    await needsApproval.useCase.execute(TENANT_ID, 'booking.created', {
      bookingId: BOOKING_ID,
      status: 'pending_approval',
    } as never);
    await autoConfirmed.useCase.execute(TENANT_ID, 'booking.created', {
      bookingId: BOOKING_ID,
      status: 'confirmed',
    } as never);

    expect(needsApproval.sent.map((s) => s.to)).toEqual([PARTNER_STAFF.email]);
    expect(autoConfirmed.sent).toEqual([]);
  });

  it('tells the partner about an AUTO completion, but not a manual one', async () => {
    // A partner who marked it complete themselves does not need telling.
    const auto = harness();
    const manual = harness();

    await auto.useCase.execute(TENANT_ID, 'booking.completed', {
      bookingId: BOOKING_ID,
      auto: true,
    } as never);
    await manual.useCase.execute(TENANT_ID, 'booking.completed', {
      bookingId: BOOKING_ID,
    } as never);

    expect(auto.rendered.map((r) => r.templateId)).toEqual([
      'booking_completed_customer',
      'booking_auto_completed_partner',
    ]);
    expect(manual.rendered.map((r) => r.templateId)).toEqual(['booking_completed_customer']);
  });

  it('reaches EVERY partner recipient, not just the first', async () => {
    const { useCase, sent } = harness({
      ctx: context({
        partnerRecipients: [PARTNER_STAFF, { ...PARTNER_STAFF, userId: 'u2', email: 'b@x.vn' }],
      }),
    });

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never);

    expect(sent.map((s) => s.to)).toEqual([CUSTOMER.email, PARTNER_STAFF.email, 'b@x.vn']);
  });

  it('skips a customer-audience item when the booking has no customer', async () => {
    const { useCase, sent } = harness({ ctx: context({ customer: null }) });

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never);

    expect(sent.map((s) => s.to)).toEqual([PARTNER_STAFF.email]);
  });

  it('DEDUPES per (event, booking, template, recipient)', async () => {
    // The outbox is at-least-once; one recipient must not get the same mail
    // twice for the same event.
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never);

    expect(dedupeKeys).toEqual([
      `booking.confirmed:${BOOKING_ID}:booking_confirmed_customer:${CUSTOMER.userId}`,
      `booking.confirmed:${BOOKING_ID}:booking_confirmed_partner:${PARTNER_STAFF.userId}`,
    ]);
  });

  it('sends no email on a redelivery, but still writes the bell row', async () => {
    // The row is collected BEFORE the dedupe gate on purpose: a process that
    // died after sending would otherwise leave the mail delivered and the bell
    // row missing forever.
    const { useCase, sent, inboxWrites } = harness({ alreadySent: true });

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never);

    expect(sent).toEqual([]);
    expect(inboxWrites.flat().length).toBeGreaterThan(0);
  });

  it('RETHROWS a send failure so the relay retries', async () => {
    // Unlike the OTP path, an outbox-driven email must not be silently lost.
    const { useCase } = harness({ sendError: new Error('smtp down') });

    await expect(
      useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never),
    ).rejects.toThrow('smtp down');
  });

  it('writes the bell rows in ONE batch after the sends', async () => {
    // Two partner staff both get a bell row, so a per-row insert would open a
    // transaction each — the batch is what keeps this one operation, one scope.
    const { useCase, inboxWrites, tenantDb } = harness({
      ctx: context({
        partnerRecipients: [PARTNER_STAFF, { ...PARTNER_STAFF, userId: 'u2', email: 'b@x.vn' }],
      }),
    });

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: BOOKING_ID } as never);

    expect(inboxWrites).toHaveLength(1);
    expect(inboxWrites[0]).toHaveLength(2);
    expect(tenantDb.openedFor).toEqual([TENANT_ID, TENANT_ID]);
  });
});
