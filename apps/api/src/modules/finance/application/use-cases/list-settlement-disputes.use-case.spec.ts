import { describe, expect, it } from 'vitest';
import type { TenantSettlementDisputesQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { ISettlementDisputeRepository } from '../../domain/ports/settlement-dispute-repository.port';
import { ListSettlementDisputesUseCase } from './list-settlement-disputes.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const calls: Array<Record<string, unknown>> = [];
  const page = { items: [], total: 0 };
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListSettlementDisputesUseCase(
      fakePort<ISettlementDisputeRepository>({
        list: (_tx, _page, _pageSize, filters) => {
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

describe('ListSettlementDisputesUseCase', () => {
  it('lets the tenant view filter by partner from the query', async () => {
    const { useCase, tenantDb, calls } = harness();

    await useCase.execute(TENANT_ID, {
      page: 1,
      pageSize: 20,
      partnerId: 'partner-9',
    } as TenantSettlementDisputesQuery);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls[0]).toMatchObject({ partnerId: 'partner-9' });
  });

  it('overrides any query partner with the partner in scope', async () => {
    // The partner-facing route passes its own id; a query parameter must not be
    // able to widen it to somebody else's disputes.
    const { useCase, calls } = harness();

    await useCase.execute(
      TENANT_ID,
      { page: 1, pageSize: 20, partnerId: 'partner-9' } as TenantSettlementDisputesQuery,
      'partner-1',
    );

    expect(calls[0]).toMatchObject({ partnerId: 'partner-1' });
  });

  it('parses the ISO window into Dates', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, {
      page: 1,
      pageSize: 20,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    } as TenantSettlementDisputesQuery);

    expect(calls[0]).toMatchObject({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
    });
  });
});
