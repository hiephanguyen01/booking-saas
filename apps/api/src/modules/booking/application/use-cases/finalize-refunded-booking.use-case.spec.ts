import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { FinalizeRefundedBookingUseCase } from './finalize-refunded-booking.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

const booking = (status = 'cancelled'): BookingRecord =>
  ({ id: BOOKING_ID, code: 'BK-0001', status }) as unknown as BookingRecord;

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
    useCase: new FinalizeRefundedBookingUseCase(
      fakePort<IBookingRepository>({
        findById: () => Promise.resolve(record),
        applyTransition: (_tx, params) => {
          transitions.push(params);
          return Promise.resolve(booking('refunded'));
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    transitions,
    events,
  };
}

describe('FinalizeRefundedBookingUseCase', () => {
  it('ignores a booking that no longer exists', async () => {
    // The outbox handler has no request context and may run long after the fact.
    const { useCase, transitions } = harness(null);

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).resolves.toBeUndefined();
    expect(transitions).toEqual([]);
  });

  it('moves the booking to refunded once the money actually moved', async () => {
    const { useCase, tenantDb, transitions, events } = harness(booking());

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(transitions[0]).toMatchObject({
      from: 'cancelled',
      to: 'refunded',
      actor: 'system',
      reason: 'refund transfer confirmed',
    });
    expect(events).toEqual([{ eventType: 'booking.refunded', payload: { bookingId: BOOKING_ID } }]);
  });

  it('is a harmless no-op on a booking already marked refunded', async () => {
    // `refund.completed` is delivered at least once.
    const { useCase, transitions, events } = harness(booking('refunded'));

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(transitions).toEqual([]);
    expect(events).toEqual([]);
  });
});
