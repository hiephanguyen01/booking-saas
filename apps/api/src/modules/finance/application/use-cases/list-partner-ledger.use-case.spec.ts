import { describe, expect, it } from 'vitest';
import type { PartnerLedgerQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import { ListPartnerLedgerUseCase } from './list-partner-ledger.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness() {
  const calls: Array<Record<string, unknown>> = [];
  const page = { items: [], total: 0 };
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPartnerLedgerUseCase(
      fakePort<ILedgerRepository>({
        listEntries: (_tx, _page, _pageSize, filters) => {
          calls.push(filters as Record<string, unknown>);
          return Promise.resolve(page as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
  };
}

describe('ListPartnerLedgerUseCase', () => {
  it('forces the owner to the partner in scope, never taking it from the query', async () => {
    // A client-supplied ownerId here would let a partner read a neighbour's whole
    // earnings history.
    const { useCase, tenantDb, calls } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, {
      page: 1,
      pageSize: 20,
      ownerId: 'partner-2',
      ownerType: 'tenant',
    } as unknown as PartnerLedgerQuery);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls[0]).toMatchObject({ ownerType: 'partner', ownerId: PARTNER_ID });
  });

  it('parses the ISO window into Dates', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, {
      page: 1,
      pageSize: 20,
      entryType: 'partner_share',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    } as PartnerLedgerQuery);

    expect(calls[0]).toMatchObject({
      entryType: 'partner_share',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
    });
  });
});
