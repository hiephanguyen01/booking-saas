import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  ListingGroupNotFound,
  ListingGroupNotOwnedForManage,
} from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import { GetListingGroupUseCase } from './get-listing-group.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

const group = (partnerId = PARTNER_ID): ListingGroupRecord =>
  ({ id: GROUP_ID, partnerId }) as unknown as ListingGroupRecord;

function harness(record: ListingGroupRecord | null) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingGroupUseCase(
      fakePort<IListingGroupRepository>({ findById: () => Promise.resolve(record) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetListingGroupUseCase', () => {
  it('reads inside the tenant transaction', async () => {
    const record = group();
    const { useCase, tenantDb } = harness(record);

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('answers 404 for a group this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it("refuses another partner's group when a partner scope is required", async () => {
    const { useCase } = harness(group('partner-2'));

    await expect(
      useCase.execute(TENANT_ID, GROUP_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingGroupNotOwnedForManage);
  });

  it('lets a tenant-scoped caller read any group', async () => {
    const record = group('partner-2');
    const { useCase } = harness(record);

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).resolves.toBe(record);
  });
});
