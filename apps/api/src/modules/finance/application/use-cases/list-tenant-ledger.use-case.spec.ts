import { describe, expect, it } from 'vitest';
import type { LedgerQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import { ListTenantLedgerUseCase } from './list-tenant-ledger.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const calls: Array<{ page: number; pageSize: number; filters: Record<string, unknown> }> = [];
  const result = { items: [], total: 0 };
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListTenantLedgerUseCase(
      fakePort<ILedgerRepository>({
        listEntries: (_tx, page, pageSize, filters) => {
          calls.push({ page, pageSize, filters: filters as Record<string, unknown> });
          return Promise.resolve(result as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    result,
  };
}

describe('ListTenantLedgerUseCase', () => {
  it('parses the ISO date filters into real Dates', async () => {
    // The query arrives as strings over HTTP; handing those to the repository
    // would compare a string against a timestamptz column.
    const { useCase, tenantDb, calls } = harness();

    await useCase.execute(TENANT_ID, {
      page: 2,
      pageSize: 50,
      bookingId: 'booking-1',
      ownerType: 'partner',
      entryType: 'partner_share',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    } as LedgerQuery);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([
      {
        page: 2,
        pageSize: 50,
        filters: {
          bookingId: 'booking-1',
          ownerType: 'partner',
          entryType: 'partner_share',
          from: new Date('2026-08-01T00:00:00.000Z'),
          to: new Date('2026-08-31T00:00:00.000Z'),
        },
      },
    ]);
  });

  it('leaves the window open when no dates are given', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, { page: 1, pageSize: 20 } as LedgerQuery);

    expect(calls[0]?.filters).toMatchObject({ from: undefined, to: undefined });
  });
});
