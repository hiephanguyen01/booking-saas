import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { SettlementNotFound } from '../../domain/errors/finance-domain-errors';
import type { IFinanceTenantHostReader } from '../../domain/ports/finance-tenant-host-reader.port';
import type { ISettlementDisputeRepository } from '../../domain/ports/settlement-dispute-repository.port';
import { ListCustomerDisputeStatesUseCase } from './list-customer-dispute-states.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';
const NOW = new Date('2026-08-19T10:00:00Z');

const state = (overrides: Record<string, unknown> = {}) => ({
  bookingId: 'booking-1',
  status: 'dispute_window',
  disputeUntil: new Date('2026-08-25T00:00:00Z'),
  hasDispute: false,
  ...overrides,
});

function harness(states: ReturnType<typeof state>[], tenantId: string | null = TENANT_ID) {
  const tenantDb = fakeTenantDb({ now: NOW });
  return {
    useCase: new ListCustomerDisputeStatesUseCase(
      fakePort<IFinanceTenantHostReader>({ resolveTenantId: () => Promise.resolve(tenantId) }),
      fakePort<ISettlementDisputeRepository>({
        listCustomerStates: () => Promise.resolve(states as never),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('ListCustomerDisputeStatesUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase } = harness([], null);

    await expect(useCase.execute(HOST, CUSTOMER_ID)).rejects.toBeInstanceOf(SettlementNotFound);
  });

  it('answers eligibility per booking in ONE read', async () => {
    // The booking list needs this per row; asking the per-booking endpoint once
    // per row would be a request per row.
    const { useCase, tenantDb } = harness([state(), state({ bookingId: 'booking-2' })]);

    const rows = await useCase.execute(HOST, CUSTOMER_ID);

    expect(rows).toHaveLength(2);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('decides eligibility on the DATABASE clock', async () => {
    // The window closes at a wall-clock instant; using the app host's clock would
    // offer the button for a few seconds after it actually closed.
    const { useCase } = harness([
      state({ disputeUntil: new Date('2026-08-25T00:00:00Z') }),
      state({ bookingId: 'booking-2', disputeUntil: new Date('2026-08-18T00:00:00Z') }),
    ]);

    const rows = await useCase.execute(HOST, CUSTOMER_ID);

    expect(rows[0]).toMatchObject({ bookingId: 'booking-1', canOpenDispute: true });
    expect(rows[1]).toMatchObject({ bookingId: 'booking-2', canOpenDispute: false });
  });

  it('offers no second dispute on a booking that already has one', async () => {
    const { useCase } = harness([state({ hasDispute: true })]);

    expect((await useCase.execute(HOST, CUSTOMER_ID))[0]).toMatchObject({ canOpenDispute: false });
  });

  it('carries the deadline through so the UI can show it', async () => {
    const { useCase } = harness([state()]);

    expect((await useCase.execute(HOST, CUSTOMER_ID))[0]).toMatchObject({
      disputeUntil: new Date('2026-08-25T00:00:00Z'),
    });
  });
});
