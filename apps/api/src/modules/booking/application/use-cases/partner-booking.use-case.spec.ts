import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingRecord, IBookingRepository, TransitionParams } from '../../domain/ports/booking-repository.port';
import { PartnerBookingUseCase, type PartnerContext } from './partner-booking.use-case';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';
const ACTOR = '33333333-3333-3333-3333-333333333333';
const BOOKING = '44444444-4444-4444-4444-444444444444';

const ctx: PartnerContext = { tenantId: TENANT, partnerId: PARTNER, actorId: ACTOR };

function bookingWithEnd(endUtc: Date): BookingRecord {
  return {
    id: BOOKING,
    tenantId: TENANT,
    listingId: 'l',
    listingTitle: 'Studio A',
    partnerId: PARTNER,
    resourceId: 'r',
    customerId: 'c',
    customer: { id: 'c', fullName: 'Nguyễn Văn A', phone: '0912345678', email: 'a@example.com' },
    code: 'BK-TEST',
    idempotencyKey: 'k',
    bookingMode: 'hourly',
    status: 'confirmed',
    startUtc: new Date(endUtc.getTime() - 3_600_000),
    endUtc,
    guestCount: 1,
    quantity: 1,
    totalAmount: 0n,
    discountAmount: 0n,
    finalAmount: 0n,
    depositAmount: 0n,
    paidAmount: 0n,
    securityDeposit: 0n,
    pickedUpAt: null,
    returnedAt: null,
    damageAmount: 0n,
    additionalCharges: [],
    cancellationPolicyId: null,
    cancellationPolicySnapshot: null,
    promotionId: null,
    promoCode: null,
    promotionSnapshot: null,
    commissionSnapshot: null,
    pricingSnapshot: null,
    affiliateId: null,
    referralCode: null,
    customerNote: null,
    partnerNote: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeUseCase(booking: BookingRecord) {
  const applyTransition = vi.fn(async (_tx: unknown, p: TransitionParams) => ({ ...booking, status: p.to }));
  const bookings: Partial<IBookingRepository> = {
    findById: vi.fn(async () => booking),
    applyTransition,
  };
  const tenantDb = { forTenant: <T>(_t: string, fn: (tx: unknown) => Promise<T>) => fn({}) };
  const outbox = { emit: vi.fn(async () => undefined) };
  const useCase = new PartnerBookingUseCase(
    bookings as IBookingRepository,
    tenantDb as never,
    outbox as never,
  );
  return { useCase, applyTransition, outbox };
}

describe('PartnerBookingUseCase.markNoShow — §8.5 window', () => {
  beforeEach(() => vi.useRealTimers());

  it('rejects a no-show before the slot has ended', async () => {
    const { useCase, applyTransition } = makeUseCase(bookingWithEnd(new Date(Date.now() + 3_600_000)));
    await expect(useCase.markNoShow(ctx, BOOKING)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('rejects a no-show more than 48h after the slot ends', async () => {
    const end = new Date(Date.now() - 49 * 3_600_000);
    const { useCase, applyTransition } = makeUseCase(bookingWithEnd(end));
    await expect(useCase.markNoShow(ctx, BOOKING)).rejects.toMatchObject({
      response: { code: 'NO_SHOW_WINDOW_INVALID' },
    });
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('allows a no-show inside the 48h window', async () => {
    const end = new Date(Date.now() - 2 * 3_600_000);
    const { useCase, applyTransition, outbox } = makeUseCase(bookingWithEnd(end));
    const result = await useCase.markNoShow(ctx, BOOKING, 'customer never arrived');
    expect(result.status).toBe('no_show');
    expect(applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: 'no_show', reason: 'customer never arrived' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'booking.no_show' }),
    );
  });
});
