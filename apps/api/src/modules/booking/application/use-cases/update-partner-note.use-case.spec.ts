import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../domain/errors/booking-domain-errors';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import { UpdatePartnerNoteUseCase } from './update-partner-note.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';

const booking = (partnerId = PARTNER_ID): BookingRecord =>
  ({ id: BOOKING_ID, partnerId, status: 'confirmed' }) as unknown as BookingRecord;

function harness(record: BookingRecord | null) {
  const notes: Array<string | null> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new UpdatePartnerNoteUseCase(
      fakePort<IBookingRepository>({
        findById: () => Promise.resolve(record),
        updatePartnerNote: (_tx, _id, note) => {
          notes.push(note);
          return Promise.resolve(booking());
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    notes,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID };

describe('UpdatePartnerNoteUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, BOOKING_ID, 'ghi chú')).rejects.toBeInstanceOf(
      BookingNotFound,
    );
  });

  it("refuses to annotate another partner's booking", async () => {
    const { useCase, notes } = harness(booking('partner-2'));

    await expect(useCase.execute(ctx, BOOKING_ID, 'ghi chú')).rejects.toThrow();
    expect(notes).toEqual([]);
  });

  it('stores the note against the booking, in one tenant transaction', async () => {
    const { useCase, tenantDb, notes } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID, 'khách xin đến muộn');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(notes).toEqual(['khách xin đến muộn']);
  });

  it('clears the note when it is null', async () => {
    const { useCase, notes } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID, null);

    expect(notes).toEqual([null]);
  });
});
