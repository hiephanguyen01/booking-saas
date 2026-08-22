import { describe, expect, it } from 'vitest';
import type { PaymentHistoryQuery } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { ListTenantPaymentsUseCase } from './list-tenant-payments.use-case';

const TENANT_ID = 'tenant-1';

describe('ListTenantPaymentsUseCase', () => {
  it('reads the caller tenant inside one transaction and forwards the query', async () => {
    const seen: Array<{ tenantId: string; query: PaymentHistoryQuery }> = [];
    const page = { items: [], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListTenantPaymentsUseCase(
      fakePort<IPaymentRepository>({
        listTenant: (_tx, tenantId, query) => {
          seen.push({ tenantId, query });
          return Promise.resolve(page as never);
        },
      }),
      fakeTenantContext(TENANT_ID),
      tenantDb.service,
    );

    const query = { page: 1, pageSize: 20 } as PaymentHistoryQuery;
    await expect(useCase.execute(query)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    // The tenant id is passed explicitly as well as through the GUC: the repository
    // filters on it, and RLS is the second line rather than the only one.
    expect(seen).toEqual([{ tenantId: TENANT_ID, query }]);
  });
});
