import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import { RecordBalancePaymentUseCase } from './record-balance-payment.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

const booking = (overrides: Record<string, unknown> = {}): BookingRecord =>
  ({
    id: BOOKING_ID,
    status: 'confirmed',
    finalAmount: 1_000_000n,
    paidAmount: 400_000n,
    ...overrides,
  }) as unknown as BookingRecord;

function harness(record: BookingRecord | null) {
  const added: bigint[] = [];
  const tenantDb = fakeTenantDb();
  const bookings = fakePort<IBookingRepository>({
    findById: () => Promise.resolve(record),
    addPaidAmount: (_tx, _id, amount) => {
      added.push(amount);
      return Promise.resolve(null as never);
    },
  });
  return {
    useCase: new RecordBalancePaymentUseCase(bookings, tenantDb.service),
    tenantDb,
    added,
  };
}

describe('RecordBalancePaymentUseCase', () => {
  it('adds the outstanding amount to what is already paid', async () => {
    // ADDS, never sets. Routing a second payment through the confirm path would
    // reset paid_amount to the deposit and lose the balance.
    const { useCase, added } = harness(booking());

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(true);
    expect(added).toEqual([600_000n]);
  });

  it('declines to handle an unknown booking', async () => {
    const { useCase, added } = harness(null);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(false);
    expect(added).toEqual([]);
  });

  it.each(['pending_payment', 'cancelled', 'completed'])(
    'declines a %s booking so the caller runs confirmation instead',
    async (status) => {
      const { useCase, added } = harness(booking({ status }));

      await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(false);
      expect(added).toEqual([]);
    },
  );

  it('claims a redelivered event without writing again', async () => {
    // The outbox delivers at least once; on the second run the outstanding is 0,
    // and it must still report "handled" so the caller does not fall through to
    // confirmation.
    const { useCase, added } = harness(booking({ paidAmount: 1_000_000n }));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(true);
    expect(added).toEqual([]);
  });

  it('never writes a negative amount when more was paid than billed', async () => {
    const { useCase, added } = harness(booking({ paidAmount: 1_200_000n }));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(true);
    expect(added).toEqual([]);
  });

  it('works inside one transaction for the caller tenant', async () => {
    const { useCase, tenantDb } = harness(booking());

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
