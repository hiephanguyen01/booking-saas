import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { SettlementNotFound } from '../../domain/errors/finance-domain-errors';
import type { IFinanceTenantHostReader } from '../../domain/ports/finance-tenant-host-reader.port';
import type {
  ISettlementDisputeRepository,
  SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { GetCustomerBookingSettlementUseCase } from './get-customer-booking-settlement.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';
const BOOKING_ID = 'booking-1';
const NOW = new Date('2026-08-19T10:00:00Z');

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: 'settlement-1',
    bookingId: BOOKING_ID,
    status: 'dispute_window',
    disputeUntil: new Date('2026-08-25T00:00:00Z'),
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  tenantId?: string | null;
  owns?: boolean;
  record?: SettlementRecord | null;
  dispute?: SettlementDisputeRecord | null;
}

function harness(options: Options = {}) {
  const tenantDb = fakeTenantDb({ now: NOW });
  return {
    useCase: new GetCustomerBookingSettlementUseCase(
      fakePort<IFinanceTenantHostReader>({
        resolveTenantId: () =>
          Promise.resolve(options.tenantId === undefined ? TENANT_ID : options.tenantId),
      }),
      fakePort<ISettlementRepository>({
        findByBooking: () =>
          Promise.resolve(options.record === undefined ? settlement() : options.record),
      }),
      fakePort<ISettlementDisputeRepository>({
        customerOwnsBooking: () => Promise.resolve(options.owns ?? true),
        findLatestBySettlement: () => Promise.resolve(options.dispute ?? null),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetCustomerBookingSettlementUseCase', () => {
  it.each([
    ['the host resolves to no tenant', { tenantId: null }],
    ['the booking is not the caller own', { owns: false }],
    ['the booking has no settlement', { record: null }],
  ])('answers the same 404 when %s', async (_label, options) => {
    // One indistinguishable error for all three: a different one would tell a
    // stranger which booking ids exist.
    const { useCase } = harness(options);

    await expect(useCase.execute(HOST, CUSTOMER_ID, BOOKING_ID)).rejects.toBeInstanceOf(
      SettlementNotFound,
    );
  });

  it('reports the settlement with its dispute eligibility, on the database clock', async () => {
    const { useCase, tenantDb } = harness();

    await expect(useCase.execute(HOST, CUSTOMER_ID, BOOKING_ID)).resolves.toMatchObject({
      settlement: { id: 'settlement-1' },
      dispute: null,
      canOpenDispute: true,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('offers no second dispute once one exists', async () => {
    const existing = { id: 'dispute-1' } as SettlementDisputeRecord;
    const { useCase } = harness({ dispute: existing });

    await expect(useCase.execute(HOST, CUSTOMER_ID, BOOKING_ID)).resolves.toMatchObject({
      dispute: existing,
      canOpenDispute: false,
    });
  });

  it('offers no dispute once the deadline has passed', async () => {
    const { useCase } = harness({
      record: settlement({ disputeUntil: new Date('2026-08-18T00:00:00Z') }),
    });

    await expect(useCase.execute(HOST, CUSTOMER_ID, BOOKING_ID)).resolves.toMatchObject({
      canOpenDispute: false,
    });
  });
});
