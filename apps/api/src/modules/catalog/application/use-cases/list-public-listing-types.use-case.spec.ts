import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { ListPublicListingTypesUseCase } from './list-public-listing-types.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';

describe('ListPublicListingTypesUseCase', () => {
  it('serves only ACTIVE types, for the tenant the Host resolves to', async () => {
    // The storefront menu is public: an inactive type showing here would offer a
    // category the tenant has deliberately taken down.
    const rows = [] as ListingTypeRecord[];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPublicListingTypesUseCase(
      fakePort<IListingTypeRepository>({ listActive: () => Promise.resolve(rows) }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
      }),
      tenantDb.service,
    );

    await expect(useCase.execute(HOST)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
