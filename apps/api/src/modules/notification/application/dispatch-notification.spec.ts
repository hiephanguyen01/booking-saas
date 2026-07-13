import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DispatchNotificationService } from './dispatch-notification.service';
import type { IEmailSender } from '../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../domain/ports/notification-log-repository.port';
import type { INotificationReader } from '../domain/ports/notification-reader.port';
import type { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';

/** forTenant just runs the callback with a dummy tx — no DB in these unit tests. */
const tenantDb = {
  forTenant: <T>(_tenantId: string, fn: (tx: unknown) => Promise<T>): Promise<T> => fn({}),
} as unknown as TenantDbService;

function makeDeps() {
  const reader = {
    loadBookingContext: vi.fn(),
    loadListingContext: vi.fn(),
    loadPartnerContext: vi.fn(),
    findUpcomingConfirmed: vi.fn(),
  } satisfies INotificationReader;
  const email = { send: vi.fn().mockResolvedValue(undefined) } satisfies IEmailSender;
  const logs = {
    alreadySent: vi.fn().mockResolvedValue(false),
    record: vi.fn().mockResolvedValue(undefined),
  } satisfies INotificationLogRepository;
  const service = new DispatchNotificationService(reader, email, logs, tenantDb);
  return { reader, email, logs, service };
}

const partnerCtx = {
  tenantName: 'StudioHub',
  partnerName: 'Giang Studio',
  recipients: [{ userId: 'u1', email: 'giang@giangstudio.vn', name: 'Giang', locale: 'vi' }],
};

describe('dispatchPayoutEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips affiliate payees (no Phase-1 template)', async () => {
    const { reader, email, service } = makeDeps();
    await service.dispatchPayoutEvent('t1', { payoutId: 'p1', payeeType: 'affiliate', payeeId: 'a1', amount: '1000' });
    expect(reader.loadPartnerContext).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('emails partner members with the formatted amount', async () => {
    const { reader, email, logs, service } = makeDeps();
    reader.loadPartnerContext.mockResolvedValue(partnerCtx);
    await service.dispatchPayoutEvent('t1', { payoutId: 'p1', payeeType: 'partner', payeeId: 'pr1', amount: '1500000' });
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0]![0];
    expect(msg.to).toBe('giang@giangstudio.vn');
    expect(msg.subject).toContain('1.500.000');
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', eventType: 'payout.paid' }));
  });

  it('does not resend when already sent (dedupe)', async () => {
    const { reader, email, logs, service } = makeDeps();
    reader.loadPartnerContext.mockResolvedValue(partnerCtx);
    logs.alreadySent.mockResolvedValue(true);
    await service.dispatchPayoutEvent('t1', { payoutId: 'p1', payeeType: 'partner', payeeId: 'pr1', amount: '1500000' });
    expect(email.send).not.toHaveBeenCalled();
  });
});

const bookingCtx = {
  bookingId: 'b1',
  code: 'BK-7F3K9Q',
  status: 'confirmed',
  listingTitle: 'Vintage Studio',
  tenantName: 'StudioHub',
  partnerName: 'Giang Studio',
  startUtc: new Date('2026-07-09T11:00:00Z'),
  timezone: 'Asia/Ho_Chi_Minh',
  finalAmount: 600000n,
  customer: { userId: 'c1', email: 'an@example.com', name: 'An', locale: 'vi' },
  partnerRecipients: [],
};

describe('sendBookingOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emails the OTP to the booking customer without a dedupe guard', async () => {
    const { reader, email, logs, service } = makeDeps();
    reader.loadBookingContext.mockResolvedValue(bookingCtx);
    await service.sendBookingOtp('t1', 'b1', '123456', 600);
    expect(logs.alreadySent).not.toHaveBeenCalled(); // each request resends a fresh code
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0]![0];
    expect(msg.to).toBe('an@example.com');
    expect(msg.text).toContain('123456');
    expect(msg.text).toContain('10 phút'); // 600s → 10 min
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', eventType: 'booking.otp' }));
  });

  it('swallows a send failure (the code stays valid) and logs it', async () => {
    const { reader, email, logs, service } = makeDeps();
    reader.loadBookingContext.mockResolvedValue(bookingCtx);
    email.send.mockRejectedValueOnce(new Error('smtp down'));
    await expect(service.sendBookingOtp('t1', 'b1', '123456', 600)).resolves.toBeUndefined();
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', eventType: 'booking.otp' }));
  });
});
