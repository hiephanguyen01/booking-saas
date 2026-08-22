import { describe, expect, it } from 'vitest';
import type { PaymentHistoryQuery } from '@booking/contracts';
import { fakePort } from '~testing';
import type { IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { ListPlatformPaymentsUseCase } from './list-platform-payments.use-case';

describe('ListPlatformPaymentsUseCase', () => {
  it('reads across tenants without opening a tenant transaction', async () => {
    // Platform-wide reads run on the admin pool; wrapping them in `forTenant`
    // would scope them to one tenant and silently empty the page.
    const queries: PaymentHistoryQuery[] = [];
    const page = { items: [], total: 0 };
    const useCase = new ListPlatformPaymentsUseCase(
      fakePort<IPaymentRepository>({
        listPlatform: (query) => {
          queries.push(query);
          return Promise.resolve(page as never);
        },
      }),
    );

    const query = { page: 2, pageSize: 20 } as PaymentHistoryQuery;
    await expect(useCase.execute(query)).resolves.toBe(page);
    expect(queries).toEqual([query]);
  });
});
