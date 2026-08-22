import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BookingNotFound, InvalidNoShowWindow } from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { MarkNoShowUseCase } from './mark-no-show.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';
const END = new Date('2026-09-10T12:00:00Z');

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
    securityDeposit: 200_000n,
    additionalCharges: [],
    ...overrides,
  }) as unknown as BookingRecord;

function harness(record: BookingRecord | null, now: Date) {
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
    useCase: new MarkNoShowUseCase(bookings, tenantDb.service, new OutboxService()),
    tenantDb,
    transitions,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID, actorId: 'staff-1' };
const hoursAfterEnd = (hours: number) => new Date(END.getTime() + hours * 3_600_000);

describe('MarkNoShowUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null, hoursAfterEnd(1));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it("refuses another partner's booking", async () => {
    const { useCase, transitions } = harness(booking({ partnerId: 'partner-2' }), hoursAfterEnd(1));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toThrow();
    expect(transitions).toEqual([]);
  });

  it('refuses a no-show before the slot has even ended', async () => {
    const { useCase, transitions } = harness(booking(), new Date(END.getTime() - 60_000));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(InvalidNoShowWindow);
    expect(transitions).toEqual([]);
  });

  it('refuses a no-show marked long after the window closed', async () => {
    // Past the window the scheduler auto-completes the booking, so a later mark
    // would race a transition that recognises revenue on a different basis.
    const { useCase, transitions } = harness(booking(), hoursAfterEnd(48));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(InvalidNoShowWindow);
    expect(transitions).toEqual([]);
  });

  it('marks the no-show inside the window and returns the security deposit', async () => {
    // The customer never took custody of any inventory, so its separately-held
    // deposit comes back even though the service deposit goes to settlement.
    const { useCase, tenantDb, transitions, events } = harness(booking(), hoursAfterEnd(1));

    await useCase.execute(ctx, BOOKING_ID, 'khách không đến');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(transitions[0]).toMatchObject({
      from: 'confirmed',
      to: 'no_show',
      actor: 'partner',
      actorId: 'staff-1',
      reason: 'khách không đến',
    });
    expect(events).toEqual([
      {
        eventType: 'booking.no_show',
        payload: {
          securityDeposit: '200000',
          bookingId: BOOKING_ID,
          code: 'BK-0001',
        },
      },
    ]);
  });

  it('refuses a no-show on a booking that is not confirmed', async () => {
    const { useCase, transitions } = harness(booking({ status: 'completed' }), hoursAfterEnd(1));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toThrow();
    expect(transitions).toEqual([]);
  });
});
