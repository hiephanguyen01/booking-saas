import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import { GetBookingUseCase } from './get-booking.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';

const booking = (partnerId = PARTNER_ID): BookingRecord =>
  ({ id: BOOKING_ID, partnerId }) as unknown as BookingRecord;

function harness(record: BookingRecord | null) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetBookingUseCase(
      fakePort<IBookingRepository>({ findById: () => Promise.resolve(record) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetBookingUseCase', () => {
  it('lets a tenant-scoped caller read any of its bookings', async () => {
    const record = booking();
    const { useCase, tenantDb } = harness(record);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('lets a partner read its own booking', async () => {
    const record = booking();
    const { useCase } = harness(record);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, { partnerId: PARTNER_ID })).resolves.toBe(
      record,
    );
  });

  it("answers 404, not 403, for another partner's booking", async () => {
    // A 403 would confirm the id exists, which is exactly what lets a partner
    // enumerate its neighbours' bookings.
    const { useCase } = harness(booking('partner-2'));

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, { partnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(BookingNotFound);
  });

  it('answers 404 for a booking that does not exist', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });
});
