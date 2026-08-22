import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { IListingTypeRepository } from '../../../catalog/domain/ports/listing-type-repository.port';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import { GetPublicListingGroupUseCase } from './get-public-listing-group.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const SLUG = 'khach-san-a';

const group = (overrides: Record<string, unknown> = {}): ListingGroupRecord =>
  ({
    id: 'group-1',
    tenantId: TENANT_ID,
    partnerId: 'partner-1',
    listingTypeId: 'type-1',
    slug: SLUG,
    status: 'published',
    title: 'Khách sạn A',
    description: 'Ven biển.',
    photos: [],
    amenities: [],
    partnerPublic: {
      status: 'approved',
      name: 'Đối tác A',
      slug: 'doi-tac-a',
      logoUrl: null,
      verifiedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    ...overrides,
  }) as unknown as ListingGroupRecord;

const child = (): ListingRecord =>
  ({
    id: 'listing-1',
    tenantId: TENANT_ID,
    partnerId: 'partner-1',
    groupId: 'group-1',
    status: 'published',
    title: 'Phòng Deluxe',
    slug: 'phong-deluxe',
    description: null,
    photos: [],
    attributes: {},
    capacity: 2,
    bookingModes: ['daily'],
    modeConfig: { daily: { basePricePerNight: '900000' } },
    ratingAvg: null,
    reviewCount: 0,
  }) as unknown as ListingRecord;

function harness(record: ListingGroupRecord | null) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPublicListingGroupUseCase(
      fakePort<IListingGroupRepository>({ findBySlug: () => Promise.resolve(record) }),
      fakePort<IListingRepository>({ list: () => Promise.resolve([child()]) }),
      fakePort<IListingTypeRepository>({
        findById: () => Promise.resolve({ id: 'type-1', itemLabel: 'phòng' } as never),
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('GetPublicListingGroupUseCase', () => {
  it('serves a published post for the tenant the Host resolves to', async () => {
    const { useCase, tenantDb } = harness(group());

    await expect(useCase.execute(HOST, SLUG)).resolves.toMatchObject({ slug: SLUG });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('answers 404 for a slug this host does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(HOST, SLUG)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it.each(['draft', 'pending_review', 'archived'])(
    'answers 404 for a %s post rather than serving it',
    async (status) => {
      // The slug survives a hide, so a guessed URL must not resurrect the content.
      const { useCase } = harness(group({ status }));

      await expect(useCase.execute(HOST, SLUG)).rejects.toBeInstanceOf(ListingGroupNotFound);
    },
  );

  it('answers 404 when the PARTNER is not approved, even for a published post', async () => {
    // A partner suspended after publication must disappear from the storefront
    // without every one of their posts having to be hidden one by one.
    const { useCase } = harness(
      group({
        partnerPublic: {
          status: 'suspended',
          name: 'Đối tác A',
          slug: 'doi-tac-a',
          logoUrl: null,
          verifiedAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      }),
    );

    await expect(useCase.execute(HOST, SLUG)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });
});
