import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IListingTypeRepository } from '../../../catalog/domain/ports/listing-type-repository.port';
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import { GetListingGroupDetailUseCase } from './get-listing-group-detail.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

const group = (partnerId = PARTNER_ID): ListingGroupRecord =>
  ({
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId,
    listingTypeId: 'type-1',
    slug: 'khach-san-a',
    title: 'Khách sạn A',
    description: null,
    photos: [],
    amenities: [],
    status: 'published',
    publishedBy: 'admin',
    hiddenBy: null,
    // `children` is the stats projection the group mapper derives listingCount /
    // readyListingCount / priceFrom from — one definition of "ready", shared with
    // the group list (§7.3).
    children: [
      {
        description: 'Phòng hướng biển.',
        photos: ['https://cdn.example/room.jpg'],
        bookingModes: ['daily'],
        modeConfig: { daily: { basePricePerNight: '900000' } },
      },
    ],
    ratingAvg: null,
    reviewCount: 0,
    bookingCount: 0,
    favoriteCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }) as unknown as ListingGroupRecord;

const child = (id: string): ListingRecord =>
  ({
    id,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    groupId: GROUP_ID,
    status: 'published',
    title: `Phòng ${id}`,
    slug: `phong-${id}`,
    description: null,
    photos: [],
    attributes: {},
    bookingModes: ['daily'],
    modeConfig: { daily: { basePricePerNight: '900000' } },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }) as unknown as ListingRecord;

interface Options {
  record?: ListingGroupRecord | null;
  children?: ListingRecord[];
  itemLabel?: string | null;
}

function harness(options: Options = {}) {
  const listArgs: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingGroupDetailUseCase(
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(options.record === undefined ? group() : options.record),
      }),
      fakePort<IListingRepository>({
        list: (_tx, filter) => {
          listArgs.push(filter);
          return Promise.resolve(options.children ?? [child('listing-1')]);
        },
      }),
      fakePort<IListingTypeRepository>({
        findById: () =>
          Promise.resolve(
            (options.itemLabel === undefined
              ? { id: 'type-1', itemLabel: 'phòng' }
              : { id: 'type-1', itemLabel: options.itemLabel }) as never,
          ),
      }),
      tenantDb.service,
    ),
    tenantDb,
    listArgs,
  };
}

describe('GetListingGroupDetailUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it("answers not-found, not forbidden, for another partner's post", async () => {
    const { useCase } = harness({ record: group('partner-2') });

    await expect(useCase.execute(TENANT_ID, GROUP_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      ListingGroupNotFound,
    );
  });

  it('returns the post with its items in one transaction', async () => {
    const { useCase, tenantDb, listArgs } = harness({
      children: [child('listing-1'), child('listing-2')],
    });

    const result = await useCase.execute(TENANT_ID, GROUP_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listArgs).toEqual([{ groupId: GROUP_ID, partnerId: undefined }]);
    expect(result.listings).toHaveLength(2);
  });

  it('scopes the item read to the partner on a partner-scoped call', async () => {
    const { useCase, listArgs } = harness();

    await useCase.execute(TENANT_ID, GROUP_ID, PARTNER_ID);

    expect(listArgs).toEqual([{ groupId: GROUP_ID, partnerId: PARTNER_ID }]);
  });

  it("uses the listing type's own word for an item", async () => {
    // "phòng" for a hotel, "sân" for a pitch — the dashboard copy is the tenant's,
    // not a hardcoded noun.
    const { useCase } = harness({ itemLabel: 'sân' });

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).resolves.toMatchObject({ itemLabel: 'sân' });
  });

  it('falls back to a generic word when the type names none', async () => {
    const { useCase } = harness({ itemLabel: '   ' });

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).resolves.toMatchObject({
      itemLabel: 'hạng mục',
    });
  });
});
