import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import type {
  BookingRecord,
  BookingStatusHistoryRecord,
  IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { GetBookingHistoryUseCase } from './get-booking-history.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';

const booking = (partnerId = PARTNER_ID): BookingRecord =>
  ({ id: BOOKING_ID, partnerId }) as unknown as BookingRecord;

function harness(record: BookingRecord | null) {
  const rows = [] as BookingStatusHistoryRecord[];
  const tenantDb = fakeTenantDb();
  const listed: string[] = [];
  return {
    useCase: new GetBookingHistoryUseCase(
      fakePort<IBookingRepository>({
        findById: () => Promise.resolve(record),
        listStatusHistory: (_tx, bookingId) => {
          listed.push(bookingId);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    rows,
    listed,
  };
}

describe('GetBookingHistoryUseCase', () => {
  it('reads ownership and history in the SAME transaction', async () => {
    // Two transactions would leave a window where the booking changes hands
    // between the check and the read.
    const { useCase, tenantDb, rows, listed } = harness(booking());

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listed).toEqual([BOOKING_ID]);
  });

  it('lets a partner read the history of its own booking', async () => {
    const { useCase, rows } = harness(booking());

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, { partnerId: PARTNER_ID })).resolves.toBe(
      rows,
    );
  });

  it("answers 404, not 403, for another partner's booking", async () => {
    const { useCase, listed } = harness(booking('partner-2'));

    await expect(
      useCase.execute(TENANT_ID, BOOKING_ID, { partnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(BookingNotFound);
    expect(listed).toEqual([]);
  });

  it('answers 404 for a booking that does not exist', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });
});
