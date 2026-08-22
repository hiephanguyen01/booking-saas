import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound } from '../../../listing/domain/errors/listing-errors';
import type { IListingRepository } from '../../../listing/domain/ports/listing-repository.port';
import { ListingNotOwnedForAvailability } from '../../domain/errors/availability-errors';
import type {
  AvailabilityRuleRecord,
  IAvailabilityRuleRepository,
} from '../../domain/ports/availability-rule-repository.port';
import { ListAvailabilityRulesUseCase } from './list-availability-rules.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

const listing = (partnerId = PARTNER_ID) =>
  ({ id: LISTING_ID, partnerId, resourceId: 'resource-1' }) as never;

function harness(found: unknown) {
  const rows = [] as AvailabilityRuleRecord[];
  const listed: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListAvailabilityRulesUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(found as never) }),
      fakePort<IAvailabilityRuleRepository>({
        listByListing: (_tx, listingId) => {
          listed.push(listingId);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    rows,
    listed,
  };
}

describe('ListAvailabilityRulesUseCase', () => {
  it('reads the weekly rules of a listing the partner owns', async () => {
    const { useCase, tenantDb, rows, listed } = harness(listing());

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID),
    ).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listed).toEqual([LISTING_ID]);
  });

  it('answers 404 for a listing that does not exist', async () => {
    const { useCase } = harness(null);

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID),
    ).rejects.toBeInstanceOf(ListingNotFound);
  });

  it("answers 403 for another partner's listing", async () => {
    const { useCase, listed } = harness(listing('partner-2'));

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID),
    ).rejects.toBeInstanceOf(ListingNotOwnedForAvailability);
    expect(listed).toEqual([]);
  });

  it('lets a tenant-scoped caller read any listing schedule', async () => {
    const { useCase, rows } = harness(listing('partner-2'));

    await expect(useCase.execute({ tenantId: TENANT_ID }, LISTING_ID)).resolves.toBe(rows);
  });
});
