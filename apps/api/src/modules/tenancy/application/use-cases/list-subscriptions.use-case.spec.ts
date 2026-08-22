import { describe, expect, it } from 'vitest';
import type { PaginationQuery } from '@booking/contracts';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type {
  ISubscriptionRepository,
  SubscriptionHistoryRecord,
} from '../../domain/ports/subscription-repository.port';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { ListSubscriptionsUseCase } from './list-subscriptions.use-case';

const PAGE = { items: [], total: 0 } as unknown as {
  items: SubscriptionHistoryRecord[];
  total: number;
};
const QUERY = { page: 1, pageSize: 20 } as PaginationQuery;

function harness(tenant: TenantRecord | null = ({ id: 'tenant-1' } as TenantRecord)) {
  const listed: Array<{ tenantId: string; query: PaginationQuery }> = [];
  return {
    useCase: new ListSubscriptionsUseCase(
      fakePort<ITenantRepository>({ findById: () => Promise.resolve(tenant) }),
      fakePort<ISubscriptionRepository>({
        listByTenant: (tenantId, query) => {
          listed.push({ tenantId, query });
          return Promise.resolve(PAGE as never);
        },
      }),
    ),
    listed,
  };
}

describe('ListSubscriptionsUseCase', () => {
  it('tells "no such tenant" apart from "never subscribed"', async () => {
    // An empty page for a typo'd id would read as a tenant with no billing
    // history, which is a very different thing.
    const { useCase, listed } = harness(null);

    await expect(useCase.execute('tenant-1', QUERY)).rejects.toBeInstanceOf(TenantNotFound);
    expect(listed).toEqual([]);
  });

  it('answers an empty page for a real tenant that has never subscribed', async () => {
    const { useCase, listed } = harness();

    const result = await useCase.execute('tenant-1', QUERY);

    expect(listed).toEqual([{ tenantId: 'tenant-1', query: QUERY }]);
    expect(result).toBe(PAGE);
  });
});
