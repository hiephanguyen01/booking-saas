import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IListingGroupRepository } from '../../domain/ports/listing-group-repository.port';
import { ListListingGroupsUseCase } from './list-listing-groups.use-case';

const TENANT_ID = 'tenant-1';

describe('ListListingGroupsUseCase', () => {
  it('forwards the filter and the page window inside one transaction', async () => {
    const calls: Array<{ filter: unknown; page: unknown }> = [];
    const result = { items: [], total: 0 };
    const tenantDb = fakeTenantDb();
    const useCase = new ListListingGroupsUseCase(
      fakePort<IListingGroupRepository>({
        listPage: (_tx, filter, page) => {
          calls.push({ filter, page });
          return Promise.resolve(result as never);
        },
      }),
      tenantDb.service,
    );

    const filter = { partnerId: 'partner-1', status: 'published' as const, q: 'studio' };
    const page = { page: 2, pageSize: 20 };
    await expect(useCase.execute(TENANT_ID, filter, page)).resolves.toBe(result);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ filter, page }]);
  });
});
