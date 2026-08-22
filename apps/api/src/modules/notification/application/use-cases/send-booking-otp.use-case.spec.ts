import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type {
  BookingNotificationContext,
  INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { SendBookingOtpUseCase } from './send-booking-otp.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

const CUSTOMER = {
  userId: 'user-1',
  email: 'khach@studiohub.vn',
  name: 'Khách Lẻ',
  locale: 'vi',
};

const context = (overrides: Record<string, unknown> = {}): BookingNotificationContext =>
  ({
    bookingId: BOOKING_ID,
    code: 'BK-2026-0001',
    tenantName: 'StudioHub',
    brand: { storefrontUrl: 'https://studiohub.vn' },
    customer: CUSTOMER,
    partnerRecipients: [],
    ...overrides,
  }) as unknown as BookingNotificationContext;

interface Options {
  ctx?: BookingNotificationContext | null;
  alreadySent?: boolean;
  sendError?: Error;
}

function harness(options: Options = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const logged: Array<Record<string, unknown>> = [];
  const rendered: unknown[] = [];
  const dedupeChecks: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SendBookingOtpUseCase(
      fakePort<INotificationReader>({
        loadBookingContext: () =>
          Promise.resolve(options.ctx === undefined ? context() : options.ctx),
      }),
      fakePort<IEmailSender>({
        send: (message) => {
          sent.push(message as unknown as Record<string, unknown>);
          return options.sendError ? Promise.reject(options.sendError) : Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (templateId, locale, _brand, data) => {
          rendered.push({ templateId, locale: locale ?? '', data });
          return Promise.resolve({ subject: 'Mã tra cứu', text: 't', html: '<p>t</p>' });
        },
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (key) => {
          dedupeChecks.push(key);
          return Promise.resolve(options.alreadySent ?? false);
        },
        record: (entry) => {
          logged.push(entry as unknown as Record<string, unknown>);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    sent,
    logged,
    rendered,
    dedupeChecks,
  };
}

describe('SendBookingOtpUseCase', () => {
  it('sends nothing for a booking that no longer exists', async () => {
    const { useCase, sent } = harness({ ctx: null });

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(sent).toEqual([]);
  });

  it('sends nothing when the booking has no customer to email', async () => {
    const { useCase, sent } = harness({ ctx: context({ customer: null }) });

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(sent).toEqual([]);
  });

  it('NEVER dedupes — a resend of the same code must still arrive', async () => {
    // The guest asked for it again; suppressing it would leave them with no way
    // to look their booking up.
    const { useCase, sent, dedupeChecks } = harness({ alreadySent: true });

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(dedupeChecks).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it('SWALLOWS a send failure rather than failing the guest’s request', async () => {
    // It runs inside the guest's HTTP request and the code stays valid in Redis,
    // so they can simply retry.
    const { useCase, logged } = harness({ sendError: new Error('smtp down') });

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600),
    ).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
  });

  it('carries the code and its lifetime in MINUTES into the template', async () => {
    const { useCase, rendered, tenantDb } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(rendered).toEqual([
      {
        templateId: 'booking_otp_customer',
        locale: 'vi',
        data: expect.objectContaining({
          tenantName: 'StudioHub',
          recipientName: 'Khách Lẻ',
          bookingCode: 'BK-2026-0001',
          otp: '123456',
          expiresInMin: 10,
        }),
      },
    ]);
  });

  it('rounds a sub-minute lifetime UP to one minute', async () => {
    // "Hết hạn sau 0 phút" would read as already expired.
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 20);

    expect(rendered[0]).toMatchObject({ data: expect.objectContaining({ expiresInMin: 1 }) });
  });

  it('builds a locale-correct lookup link on the tenant’s own storefront', async () => {
    const vi = harness();
    const en = harness({ ctx: context({ customer: { ...CUSTOMER, locale: 'en' } }) });

    await vi.useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);
    await en.useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(vi.rendered[0]).toMatchObject({
      data: expect.objectContaining({
        ctaUrl: 'https://studiohub.vn/vi/bookings/BK-2026-0001',
      }),
    });
    expect(en.rendered[0]).toMatchObject({
      data: expect.objectContaining({
        ctaUrl: 'https://studiohub.vn/en/bookings/BK-2026-0001',
      }),
    });
  });

  it('URL-encodes the booking code', async () => {
    const { useCase, rendered } = harness({ ctx: context({ code: 'BK/2026 0001' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(rendered[0]).toMatchObject({
      data: expect.objectContaining({
        ctaUrl: 'https://studiohub.vn/vi/bookings/BK%2F2026%200001',
      }),
    });
  });

  it('emails the customer and records the delivery', async () => {
    const { useCase, sent, logged } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID, '123456', 600);

    expect(sent[0]).toMatchObject({ to: 'khach@studiohub.vn', subject: 'Mã tra cứu' });
    expect(logged).toHaveLength(1);
  });
});
