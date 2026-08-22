import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BookingNotFound } from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { ApproveBookingUseCase } from './approve-booking.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';
const NOW = new Date('2026-09-01T00:00:00Z');

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
  const bookings = fakePort<IBookingRepository>({
    findById: () => Promise.resolve(record),
    applyTransition: (_tx, params) => {
      transitions.push(params);
      return Promise.resolve({ ...booking(), ...params } as unknown as BookingRecord);
    },
  });
  return {
    useCase: new ApproveBookingUseCase(bookings, tenantDb.service, new OutboxService()),
    tenantDb,
    transitions,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID, actorId: 'staff-1' };

describe('ApproveBookingUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it("refuses another partner's booking", async () => {
    const { useCase, transitions } = harness(booking({ partnerId: 'partner-2' }));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toThrow();
    expect(transitions).toEqual([]);
  });

  it('opens a fresh 15 minute payment window on approval', async () => {
    // The approval window was the one that just elapsed; the customer now gets the
    // ordinary checkout window, counted from the approval rather than the booking.
    const { useCase, tenantDb, transitions, events } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(transitions[0]).toMatchObject({
      from: 'pending_approval',
      to: 'pending_payment',
      actor: 'partner',
      actorId: 'staff-1',
      expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    });
    expect(events).toEqual([
      { eventType: 'booking.approved', payload: { bookingId: BOOKING_ID, code: 'BK-0001' } },
    ]);
  });

  it('refuses to approve a booking that is not awaiting approval', async () => {
    const { useCase, events } = harness(booking({ status: 'confirmed' }));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toThrow();
    expect(events).toEqual([]);
  });
});
