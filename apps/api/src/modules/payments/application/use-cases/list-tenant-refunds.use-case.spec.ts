import { describe, expect, it } from 'vitest';
import type { RefundHistoryQuery } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IRefundRepository } from '../../domain/ports/refund-repository.port';
import { ListTenantRefundsUseCase } from './list-tenant-refunds.use-case';

const TENANT_ID = 'tenant-1';

describe('ListTenantRefundsUseCase', () => {
  it('reads the caller tenant inside one transaction and forwards the query', async () => {
    const queries: RefundHistoryQuery[] = [];
    const page = { items: [], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListTenantRefundsUseCase(
      fakePort<IRefundRepository>({
        list: (_tx, query) => {
          queries.push(query);
          return Promise.resolve(page as never);
        },
      }),
      fakeTenantContext(TENANT_ID),
      tenantDb.service,
    );

    const query = { page: 1, pageSize: 20 } as RefundHistoryQuery;
    await expect(useCase.execute(query)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(queries).toEqual([query]);
  });
});
