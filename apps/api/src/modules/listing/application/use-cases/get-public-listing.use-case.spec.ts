import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { ListingNotFound } from '../../domain/errors/listing-errors';
import type {
  IListingRepository,
  PublicListingRecord,
} from '../../domain/ports/listing-repository.port';
import { GetPublicListingUseCase } from './get-public-listing.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const SLUG = 'studio-a';

function harness(record: PublicListingRecord | null) {
  const slugs: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPublicListingUseCase(
      fakePort<IListingRepository>({
        findPublicBySlug: (_tx, slug) => {
          slugs.push(slug);
          return Promise.resolve(record);
        },
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
      }),
      tenantDb.service,
    ),
    tenantDb,
    slugs,
  };
}

describe('GetPublicListingUseCase', () => {
  it('reads a PUBLISHED listing for the tenant the Host resolves to', async () => {
    // The public reader is a separate query on purpose: a draft or hidden listing
    // must not be reachable by guessing its slug.
    const record = { id: 'listing-1', slug: SLUG } as unknown as PublicListingRecord;
    const { useCase, tenantDb, slugs } = harness(record);

    await expect(useCase.execute(HOST, SLUG)).resolves.toBe(record);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(slugs).toEqual([SLUG]);
  });

  it('answers 404 for a slug that is not published on this host', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(HOST, SLUG)).rejects.toBeInstanceOf(ListingNotFound);
  });
});
