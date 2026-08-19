import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { GetListingTypeUseCase } from './get-listing-type.use-case';

const TENANT_ID = 'tenant-1';
const TYPE_ID = 'type-1';

function harness(record: ListingTypeRecord | null) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingTypeUseCase(
      fakePort<IListingTypeRepository>({ findById: () => Promise.resolve(record) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetListingTypeUseCase', () => {
  it('reads inside the tenant transaction', async () => {
    const record = { id: TYPE_ID } as ListingTypeRecord;
    const { useCase, tenantDb } = harness(record);

    await expect(useCase.execute(TENANT_ID, TYPE_ID)).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('answers 404 for a type another tenant owns', async () => {
    // RLS is what turns that into a null; this asserts the null becomes a 404
    // rather than leaking through as an empty object.
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, TYPE_ID)).rejects.toBeInstanceOf(ListingTypeNotFound);
  });
});
