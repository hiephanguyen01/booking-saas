import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IResourceRepository,
  ResourceRecord,
} from '../../domain/ports/resource-repository.port';
import { ListResourcesUseCase } from './list-resources.use-case';

const TENANT_ID = 'tenant-1';

describe('ListResourcesUseCase', () => {
  it('lists every resource of the tenant inside one transaction', async () => {
    // Deliberately unfiltered by partner: RLS scopes it to the tenant, and the
    // tenant console lists resources across all of its partners.
    const rows = [] as ResourceRecord[];
    const tenantDb = fakeTenantDb();
    const useCase = new ListResourcesUseCase(
      fakePort<IResourceRepository>({ list: () => Promise.resolve(rows) }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
