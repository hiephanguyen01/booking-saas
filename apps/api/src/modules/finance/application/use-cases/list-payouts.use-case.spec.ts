import { describe, expect, it } from 'vitest';
import type { PaginationQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPayoutRepository, PayoutRecord } from '../../domain/ports/payout-repository.port';
import { ListPayoutsUseCase } from './list-payouts.use-case';

const TENANT_ID = 'tenant-1';

describe('ListPayoutsUseCase', () => {
  it('pages the tenant payout runs inside one transaction', async () => {
    const queries: PaginationQuery[] = [];
    const page = { items: [] as PayoutRecord[], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListPayoutsUseCase(
      fakePort<IPayoutRepository>({
        list: (_tx, query) => {
          queries.push(query);
          return Promise.resolve(page as never);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 20 } as PaginationQuery;
    await expect(useCase.execute(TENANT_ID, query)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(queries).toEqual([query]);
  });
});
