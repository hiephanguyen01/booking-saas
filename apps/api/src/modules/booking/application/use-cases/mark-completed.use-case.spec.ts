import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  BookingNotFound,
  BookingServiceNotEnded,
  InventoryRequiresReturn,
  OnsiteAmountMismatch,
} from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { MarkCompletedUseCase } from './mark-completed.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';
const END = new Date('2026-09-10T12:00:00Z');
const AFTER_END = new Date('2026-09-10T13:00:00Z');

const booking = (overrides: Record<string, unknown> = {}): BookingRecord =>
  ({
    id: BOOKING_ID,
    code: 'BK-0001',
    partnerId: PARTNER_ID,
    status: 'confirmed',
    bookingMode: 'hourly',
    startUtc: new Date('2026-09-10T10:00:00Z'),
    endUtc: END,
    finalAmount: 1_000_000n,
    paidAmount: 400_000n,
    additionalCharges: [],
    securityDeposit: 0n,
    ...overrides,
  }) as unknown as BookingRecord;

function harness(record: BookingRecord | null, now: Date = AFTER_END) {
  const transitions: TransitionParams[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now });
  const bookings = fakePort<IBookingRepository>({
    findById: () => Promise.resolve(record),
    applyTransition: (_tx, params) => {
      transitions.push(params);
      return Promise.resolve({ ...booking(), ...params } as unknown as BookingRecord);
    },
  });
  return {
    useCase: new MarkCompletedUseCase(bookings, tenantDb.service, new OutboxService()),
    tenantDb,
    transitions,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID, actorId: 'staff-1' };

describe('MarkCompletedUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, BOOKING_ID, 600_000n)).rejects.toBeInstanceOf(
      BookingNotFound,
    );
  });

  it("refuses to complete another partner's booking", async () => {
    const { useCase, transitions } = harness(booking({ partnerId: 'partner-2' }));

    await expect(useCase.execute(ctx, BOOKING_ID, 600_000n)).rejects.toThrow();
    expect(transitions).toEqual([]);
  });

  it('sends an inventory booking down the return path instead', async () => {
    // Inventory releases its security deposit only through a return + inspection,
    // so completing it directly would strand the customer's deposit.
    const { useCase } = harness(booking({ bookingMode: 'inventory' }));

    await expect(useCase.execute(ctx, BOOKING_ID, 600_000n)).rejects.toBeInstanceOf(
      InventoryRequiresReturn,
    );
  });

  it('refuses to complete a service that has not ended yet', async () => {
    const { useCase } = harness(booking(), new Date('2026-09-10T11:00:00Z'));

    await expect(useCase.execute(ctx, BOOKING_ID, 600_000n)).rejects.toBeInstanceOf(
      BookingServiceNotEnded,
    );
  });

  it('refuses an on-site amount that does not match what is outstanding', async () => {
    // The partner is confirming cash they collected; a mismatch means the booking
    // and the till disagree, and settlement would be built on the wrong number.
    const { useCase, transitions } = harness(booking());

    await expect(useCase.execute(ctx, BOOKING_ID, 500_000n)).rejects.toBeInstanceOf(
      OnsiteAmountMismatch,
    );
    expect(transitions).toEqual([]);
  });

  it('counts accrued surcharges into what is still owed on site', async () => {
    const { useCase, transitions } = harness(
      booking({ additionalCharges: [{ type: 'overtime', amount: '150000' }] }),
    );

    await useCase.execute(ctx, BOOKING_ID, 750_000n);

    expect(transitions).toHaveLength(1);
  });

  it('completes on the database clock and records the partner note', async () => {
    const { useCase, tenantDb, transitions, events } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID, 600_000n, '  đã thu đủ  ');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(transitions[0]).toMatchObject({
      from: 'confirmed',
      to: 'completed',
      actor: 'partner',
      actorId: 'staff-1',
      reason: 'đã thu đủ',
    });
    expect(events).toEqual([
      {
        eventType: 'booking.completed',
        payload: { bookingId: BOOKING_ID, onsiteCollectedAmount: '600000' },
      },
    ]);
  });

  it('falls back to a default reason when the note is blank', async () => {
    const { useCase, transitions } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID, 600_000n, '   ');

    expect(transitions[0]).toMatchObject({ reason: 'partner confirmed service completion' });
  });
});
