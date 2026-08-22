import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { ListListingTypesUseCase } from './list-listing-types.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const opts: unknown[] = [];
  const rows = [] as ListingTypeRecord[];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListListingTypesUseCase(
      fakePort<IListingTypeRepository>({
        list: (_tx, options) => {
          opts.push(options);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    opts,
    rows,
  };
}

describe('ListListingTypesUseCase', () => {
  it('passes the admin filters through inside the tenant transaction', async () => {
    const { useCase, tenantDb, opts, rows } = harness();

    await expect(useCase.execute(TENANT_ID, { includeInactive: true, q: 'studio' })).resolves.toBe(
      rows,
    );
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(opts).toEqual([{ includeInactive: true, q: 'studio' }]);
  });

  it('keeps inactive types out by default', async () => {
    // The admin list is the only surface that may show a disabled type; every
    // other read goes through `listActive`.
    const { useCase, opts } = harness();

    await useCase.execute(TENANT_ID, { includeInactive: false });

    expect(opts).toEqual([{ includeInactive: false }]);
  });
});
