import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import { GetListingUseCase } from './get-listing.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

const listing = (partnerId = PARTNER_ID): ListingRecord =>
  ({ id: LISTING_ID, partnerId }) as unknown as ListingRecord;

function harness(record: ListingRecord | null) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(record) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetListingUseCase', () => {
  it('reads inside the tenant transaction', async () => {
    const record = listing();
    const { useCase, tenantDb } = harness(record);

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('answers 404 for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).rejects.toBeInstanceOf(ListingNotFound);
  });

  it("answers 403 for another partner's listing when a partner scope is required", async () => {
    // Deliberately 403 rather than the 404 the booking reads use: a partner
    // managing listings already knows the tenant's catalogue exists, so the
    // distinction leaks nothing and the message is more useful.
    const { useCase } = harness(listing('partner-2'));

    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingNotOwned);
  });

  it('lets a tenant-scoped caller read any listing', async () => {
    const record = listing('partner-2');
    const { useCase } = harness(record);

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).resolves.toBe(record);
  });
});
