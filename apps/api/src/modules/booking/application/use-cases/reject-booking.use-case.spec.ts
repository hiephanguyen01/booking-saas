import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BookingNotFound } from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { RejectBookingUseCase } from './reject-booking.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';

const booking = (overrides: Record<string, unknown> = {}): BookingRecord =>
  ({
    id: BOOKING_ID,
    code: 'BK-0001',
    partnerId: PARTNER_ID,
    status: 'pending_approval',
    ...overrides,
  }) as unknown as BookingRecord;

function harness(record: BookingRecord | null) {
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
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new RejectBookingUseCase(
      fakePort<IBookingRepository>({
        findById: () => Promise.resolve(record),
        applyTransition: (_tx, params) => {
          transitions.push(params);
          return Promise.resolve({ ...booking(), ...params } as unknown as BookingRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    transitions,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID, actorId: 'staff-1' };

describe('RejectBookingUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it("refuses another partner's booking", async () => {
    const { useCase, transitions } = harness(booking({ partnerId: 'partner-2' }));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toThrow();
    expect(transitions).toEqual([]);
  });

  it('records the reason on the transition and announces the rejection', async () => {
    const { useCase, transitions, events } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID, 'hết chỗ');

    expect(transitions[0]).toMatchObject({
      from: 'pending_approval',
      to: 'rejected',
      actor: 'partner',
      actorId: 'staff-1',
      reason: 'hết chỗ',
    });
    expect(events).toEqual([
      { eventType: 'booking.rejected', payload: { bookingId: BOOKING_ID, code: 'BK-0001' } },
    ]);
  });

  it('leaves no expiry on a rejected booking', async () => {
    // Nothing is pending any more; a leftover deadline would have the sweeper
    // transitioning an already-terminal booking.
    const { useCase, transitions } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID);

    expect(transitions[0]?.expiresAt).toBeUndefined();
  });
});
