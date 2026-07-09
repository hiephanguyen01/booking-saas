import { describe, expect, it, vi } from 'vitest';
import type { BookingStatus } from '@booking/shared';
import type { BookingRecord, IBookingRepository, TransitionParams } from '../../domain/ports/booking-repository.port';
import { SlotTakenError } from '../../domain/booking-errors';
import { ConfirmBookingUseCase } from './confirm-booking.use-case';

const TENANT = '11111111-1111-1111-1111-111111111111';
const BOOKING = '44444444-4444-4444-4444-444444444444';

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: BOOKING,
    tenantId: TENANT,
    listingId: 'l',
    partnerId: 'p',
    resourceId: 'r',
    customerId: 'cust',
    code: 'BK-TEST',
    idempotencyKey: 'k',
    bookingMode: 'hourly',
    status: 'pending_payment',
    startUtc: new Date(),
    endUtc: new Date(),
    guestCount: 1,
    quantity: 1,
    totalAmount: 100_000n,
    discountAmount: 0n,
    finalAmount: 100_000n,
    depositAmount: 30_000n,
    paidAmount: 0n,
    securityDeposit: 0n,
    pickedUpAt: null,
    returnedAt: null,
    damageAmount: 0n,
    cancellationPolicyId: null,
    cancellationPolicySnapshot: null,
    promotionId: null,
    customerNote: null,
    expiresAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup(record: BookingRecord, applyImpl?: (tx: unknown, p: TransitionParams) => Promise<BookingRecord>) {
  const applyTransition = vi.fn(
    applyImpl ?? (async (_tx: unknown, p: TransitionParams) => ({ ...record, status: p.to, paidAmount: p.paidAmount ?? record.paidAmount })),
  );
  const bookings: Partial<IBookingRepository> = {
    findById: vi.fn(async () => record),
    applyTransition: applyTransition as never,
  };
  const tenantDb = { forTenant: <T>(_t: string, fn: (tx: unknown) => Promise<T>) => fn({}) };
  const outbox = { emit: vi.fn(async () => undefined) };
  const promotions = { reserve: vi.fn(async () => undefined) };
  const useCase = new ConfirmBookingUseCase(
    bookings as IBookingRepository,
    tenantDb as never,
    outbox as never,
    promotions as never,
  );
  return { useCase, outbox, promotions, applyTransition };
}

describe('ConfirmBookingUseCase', () => {
  it('confirms a pending_payment booking without touching promo reservation', async () => {
    const { useCase, outbox, promotions } = setup(booking({ status: 'pending_payment' }));
    const result = await useCase.execute(TENANT, BOOKING);
    expect(result.status).toBe('confirmed');
    expect(promotions.reserve).not.toHaveBeenCalled();
    expect(outbox.emit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'booking.confirmed' }));
  });

  it('re-reserves the promo on an expired→confirmed late-webhook restore', async () => {
    const { useCase, promotions } = setup(booking({ status: 'expired', promotionId: 'promo-1', discountAmount: 20_000n }));
    await useCase.execute(TENANT, BOOKING);
    expect(promotions.reserve).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      expect.objectContaining({ promotionId: 'promo-1', bookingId: BOOKING, customerId: 'cust', discountAmount: 20_000n }),
    );
  });

  it('auto-refunds (booking.cancelled, 100%) when the slot was taken during a restore', async () => {
    const record = booking({ status: 'expired', depositAmount: 30_000n });
    const apply = async (_tx: unknown, p: TransitionParams): Promise<BookingRecord> => {
      if ((p.to as BookingStatus) === 'confirmed') throw new SlotTakenError();
      return { ...record, status: p.to };
    };
    const { useCase, outbox } = setup(record, apply);
    const result = await useCase.execute(TENANT, BOOKING);
    // The booking is returned unchanged (still expired) — no 500 surfaced.
    expect(result.status).toBe('expired');
    expect(outbox.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'booking.cancelled',
        payload: expect.objectContaining({ bookingId: BOOKING, refundAmount: '30000', refundPercent: 100 }),
      }),
    );
  });
});
