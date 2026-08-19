import { describe, expect, it } from 'vitest';
import type { OpenSettlementDisputeInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  CustomerBookingNotFound,
  DisputeWindowClosed,
  FinanceTenantNotFound,
  SettlementNotFound,
} from '../../domain/errors/finance-domain-errors';
import type { IFinanceTenantHostReader } from '../../domain/ports/finance-tenant-host-reader.port';
import type {
  ISettlementDisputeRepository,
  SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { OpenSettlementDisputeUseCase } from './open-settlement-dispute.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';
const BOOKING_ID = 'booking-1';
const SETTLEMENT_ID = 'settlement-1';

const settlement = (): SettlementRecord =>
  ({
    id: SETTLEMENT_ID,
    bookingId: BOOKING_ID,
    status: 'dispute_window',
  }) as unknown as SettlementRecord;

const dispute = (status = 'open'): SettlementDisputeRecord =>
  ({
    id: 'dispute-1',
    settlementId: SETTLEMENT_ID,
    bookingId: BOOKING_ID,
    status,
  }) as unknown as SettlementDisputeRecord;

interface Options {
  tenantId?: string | null;
  owns?: boolean;
  record?: SettlementRecord | null;
  existing?: SettlementDisputeRecord | null;
  windowOpened?: boolean;
}

function harness(options: Options = {}) {
  const created: unknown[] = [];
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
    useCase: new OpenSettlementDisputeUseCase(
      fakePort<IFinanceTenantHostReader>({
        resolveTenantId: () =>
          Promise.resolve(options.tenantId === undefined ? TENANT_ID : options.tenantId),
      }),
      fakePort<ISettlementRepository>({
        findByBooking: () =>
          Promise.resolve(options.record === undefined ? settlement() : options.record),
        markDisputed: () => Promise.resolve(options.windowOpened ?? true),
      }),
      fakePort<ISettlementDisputeRepository>({
        customerOwnsBooking: () => Promise.resolve(options.owns ?? true),
        findLatestBySettlement: () => Promise.resolve(options.existing ?? null),
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve(dispute());
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    created,
    events,
  };
}

const input = {
  bookingId: BOOKING_ID,
  reason: 'Phòng bẩn',
  evidence: ['uploads/a.jpg'],
} as OpenSettlementDisputeInput;

describe('OpenSettlementDisputeUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase, tenantDb } = harness({ tenantId: null });

    await expect(useCase.execute(HOST, CUSTOMER_ID, input)).rejects.toBeInstanceOf(
      FinanceTenantNotFound,
    );
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('refuses a booking that is not the caller own', async () => {
    // Ownership is checked before the settlement is even read, so a guessed
    // booking id cannot confirm that a settlement exists.
    const { useCase, created } = harness({ owns: false });

    await expect(useCase.execute(HOST, CUSTOMER_ID, input)).rejects.toBeInstanceOf(
      CustomerBookingNotFound,
    );
    expect(created).toEqual([]);
  });

  it('refuses a booking with no settlement yet', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(HOST, CUSTOMER_ID, input)).rejects.toBeInstanceOf(
      SettlementNotFound,
    );
  });

  it('returns the existing open claim instead of opening a second', async () => {
    // Two taps on the button must not create two claims against the same hold.
    const existing = dispute('open');
    const { useCase, created, events } = harness({ existing });

    await expect(useCase.execute(HOST, CUSTOMER_ID, input)).resolves.toBe(existing);
    expect(created).toEqual([]);
    expect(events).toEqual([]);
  });

  it('refuses once the settlement will no longer accept a dispute', async () => {
    // The guarded `markDisputed` is the real deadline: the window closes in the
    // database, not against the app clock.
    const { useCase, created } = harness({ windowOpened: false });

    await expect(useCase.execute(HOST, CUSTOMER_ID, input)).rejects.toBeInstanceOf(
      DisputeWindowClosed,
    );
    expect(created).toEqual([]);
  });

  it('opens the claim against the settlement and announces it', async () => {
    const { useCase, tenantDb, created, events } = harness();

    await useCase.execute(HOST, CUSTOMER_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created).toEqual([
      {
        settlementId: SETTLEMENT_ID,
        bookingId: BOOKING_ID,
        openedByUserId: CUSTOMER_ID,
        openedByRole: 'customer',
        reason: 'Phòng bẩn',
        evidence: ['uploads/a.jpg'],
      },
    ]);
    expect(events).toEqual([
      {
        eventType: 'settlement.dispute_opened',
        payload: { disputeId: 'dispute-1', settlementId: SETTLEMENT_ID, bookingId: BOOKING_ID },
      },
    ]);
  });
});
