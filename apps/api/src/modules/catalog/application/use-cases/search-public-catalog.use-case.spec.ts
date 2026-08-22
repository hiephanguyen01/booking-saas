import { describe, expect, it } from 'vitest';
import type { PublicCatalogSearchQuery } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type { IHoldReader } from '../../domain/ports/hold-reader.port';
import {
  CatalogAttributeFilterInvalid,
  CatalogDateFilterDisabled,
  CatalogListingTypeNotFound,
  CatalogModeNotAllowed,
  CatalogScheduleQueryInvalid,
} from '../catalog-search-http-errors';
import type {
  IListingReadRepository,
  PublicListingRecord,
} from '../../domain/ports/listing-read-repository.port';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { SearchPublicCatalogUseCase } from './search-public-catalog.use-case';

const HOST = 'studiohub.vn';
const TZ = 'Asia/Ho_Chi_Minh';

const listingType = (overrides: Record<string, unknown> = {}): ListingTypeRecord =>
  ({
    id: 'type-1',
    name: 'Sân bóng',
    slug: 'san-bong',
    isActive: true,
    allowedModes: ['hourly', 'daily'],
    defaultModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    attributeSchema: [
      { key: 'surface', label: 'Mặt sân', type: 'select', filterable: true, options: [] },
      { key: 'note', label: 'Ghi chú', type: 'text', filterable: false },
    ],
    searchConfig: { schedule: 'none', systemFacets: [], attributeFacets: [] },
    unitLabel: 'giờ',
    structure: 'standalone',
    ...overrides,
  }) as unknown as ListingTypeRecord;

const listing = (overrides: Record<string, unknown> = {}): PublicListingRecord =>
  ({
    id: 'listing-1',
    title: 'Sân bóng số 1',
    slug: 'san-bong-so-1',
    listingTypeSlug: 'san-bong',
    partnerSlug: 'studio-giang',
    attributes: {},
    photos: ['https://cdn/a.jpg'],
    modeConfig: {
      hourly: { basePrice: '500000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 },
    },
    bookingModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    capacity: 10,
    stockQuantity: null,
    bufferBefore: 0,
    bufferAfter: 0,
    depositPercent: 100,
    resourceId: 'resource-1',
    resourceTimezone: TZ,
    provinceCode: '79',
    provinceName: 'TP. Hồ Chí Minh',
    wardCode: '26734',
    wardName: 'Phường Bến Nghé',
    address: '12 Nguyễn Huệ',
    latitude: 10.77,
    longitude: 106.7,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    completedBookings: 5,
    ratingAvg: 4.5,
    reviewCount: 10,
    availabilityRules: [],
    availabilityExceptions: [],
    pricingRules: [],
    group: null,
    ...overrides,
  }) as unknown as PublicListingRecord;

interface Options {
  type?: ListingTypeRecord | null;
  listings?: PublicListingRecord[];
}

function harness(options: Options = {}) {
  const busyCalls: unknown[] = [];
  const inventoryCalls: unknown[] = [];
  const holdCalls: unknown[] = [];
  const findArgs: Array<Record<string, unknown>> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SearchPublicCatalogUseCase(
      fakePort<IListingReadRepository>({
        findPublished: (_tx, args) => {
          findArgs.push(args as unknown as Record<string, unknown>);
          return Promise.resolve(options.listings ?? [listing()]);
        },
        busyRanges: (...args: unknown[]) => {
          busyCalls.push(args.slice(1));
          return Promise.resolve([]);
        },
        inventoryUsage: (...args: unknown[]) => {
          inventoryCalls.push(args.slice(1));
          return Promise.resolve([]);
        },
      }),
      fakePort<IListingTypeRepository>({
        findBySlug: () => Promise.resolve(options.type === undefined ? listingType() : options.type),
      }),
      fakePort<IHoldReader>({
        activeHoldsByResource: (...args: unknown[]) => {
          holdCalls.push(args);
          return Promise.resolve(new Map());
        },
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: 'tenant-9' }),
      }),
      tenantDb.service,
    ),
    tenantDb,
    busyCalls,
    inventoryCalls,
    holdCalls,
    findArgs,
  };
}

const query = (overrides: Partial<PublicCatalogSearchQuery> = {}) =>
  ({
    type: 'san-bong',
    partner: undefined,
    mode: undefined,
    q: '',
    location: [],
    amenities: [],
    guests: 1,
    quantity: 1,
    sort: 'relevance',
    page: 1,
    pageSize: 24,
    attributes: {},
    attributeRanges: {},
    ...overrides,
  }) as PublicCatalogSearchQuery;

describe('SearchPublicCatalogUseCase', () => {
  it('answers not-found for an unknown or DEACTIVATED listing type', async () => {
    // A deactivated type is hidden from the storefront exactly like a missing
    // one — the response must not distinguish them.
    const missing = harness({ type: null });
    const inactive = harness({ type: listingType({ isActive: false }) });

    await expect(missing.useCase.execute(HOST, query())).rejects.toBeInstanceOf(
      CatalogListingTypeNotFound,
    );
    await expect(inactive.useCase.execute(HOST, query())).rejects.toBeInstanceOf(
      CatalogListingTypeNotFound,
    );
  });

  it('resolves the tenant from the host and reads inside its scope', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute(HOST, query());

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
  });

  it('refuses a mode the listing TYPE does not allow', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, query({ mode: 'inventory' })),
    ).rejects.toBeInstanceOf(CatalogModeNotAllowed);
  });

  it("defaults the mode to the type's configured SCHEDULE", async () => {
    // Without it a type configured for date search would ignore the dates.
    const { useCase } = harness({
      type: listingType({ searchConfig: { schedule: 'hourly', systemFacets: [], attributeFacets: [] } }),
    });

    const result = await useCase.execute(HOST, query());

    expect(result.applied.mode).toBe('hourly');
  });

  it('refuses a date filter on a type with NO schedule search', async () => {
    // The filter would silently do nothing, which reads as "no results here".
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, query({ date: '2026-09-10' })),
    ).rejects.toBeInstanceOf(CatalogDateFilterDisabled);
  });

  it('refuses a from/to range on an HOURLY search', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, query({ mode: 'hourly', from: '2026-09-10', to: '2026-09-12' })),
    ).rejects.toBeInstanceOf(CatalogScheduleQueryInvalid);
  });

  it('refuses a start/end time on a DAILY search', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, query({ mode: 'daily', startTime: '08:00', endTime: '10:00' })),
    ).rejects.toBeInstanceOf(CatalogScheduleQueryInvalid);
  });

  it('ALLOWS a bare date on a fixed-package daily search', async () => {
    // A package has its own length, so the guest picks a start date rather than
    // a range.
    const { useCase } = harness({
      type: listingType({ bookingSelection: 'fixed_packages' }),
      listings: [
        listing({
          bookingSelection: 'fixed_packages',
          bookingModes: ['daily'],
          modeConfig: {
            daily: {
              basePricePerNight: '2000000',
              checkinTime: '14:00',
              checkoutTime: '12:00',
              packages: [
                { id: 'pkg-2n', mode: 'daily', durationDays: 2, price: '3500000', isActive: true },
              ],
            },
          },
        }),
      ],
    });

    await expect(
      useCase.execute(HOST, query({ mode: 'daily', date: '2026-09-10' })),
    ).resolves.toBeTruthy();
  });

  it('REFUSES a filter on an attribute the type does not expose', async () => {
    // Silently ignoring it would show results that do not match what the guest
    // asked for.
    const unknownKey = harness();
    const notFilterable = harness();

    await expect(
      unknownKey.useCase.execute(HOST, query({ attributes: { colour: ['red'] } })),
    ).rejects.toBeInstanceOf(CatalogAttributeFilterInvalid);
    await expect(
      notFilterable.useCase.execute(HOST, query({ attributes: { note: ['x'] } })),
    ).rejects.toBeInstanceOf(CatalogAttributeFilterInvalid);
  });

  it('checks attribute RANGES against the same allow-list', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, query({ attributeRanges: { colour: { min: 1 } } as never })),
    ).rejects.toBeInstanceOf(CatalogAttributeFilterInvalid);
  });

  it('drops a listing that cannot seat the requested party', async () => {
    const { useCase } = harness({
      listings: [listing({ capacity: 4 }), listing({ id: 'listing-2', slug: 'b', capacity: 20 })],
    });

    const result = await useCase.execute(HOST, query({ guests: 10 }));

    expect(result.items.map((i) => i.id)).toEqual(['listing-2']);
  });

  it('matches a location filter against the code OR the free text', async () => {
    // The free-text half is case-insensitive but DIACRITIC-sensitive: the
    // comparison only lowercases, so "Bến Nghé" matches and "ben nghe" does not.
    const { useCase } = harness();

    await expect(
      useCase.execute(HOST, query({ location: ['79'] })),
    ).resolves.toMatchObject({ pagination: { total: 1 } });
    await expect(
      useCase.execute(HOST, query({ location: ['26734'] })),
    ).resolves.toMatchObject({ pagination: { total: 1 } });
    await expect(
      useCase.execute(HOST, query({ location: ['bến nghé'] })),
    ).resolves.toMatchObject({ pagination: { total: 1 } });
    await expect(
      useCase.execute(HOST, query({ location: ['Hà Nội'] })),
    ).resolves.toMatchObject({ pagination: { total: 0 } });
  });

  it("prefers the POST's location over a child listing's own", async () => {
    // A hotel's rooms carry the hotel's address, so the card must filter on the
    // post rather than on whatever a child row happens to hold.
    const { useCase } = harness({
      listings: [
        listing({
          provinceCode: '01',
          provinceName: 'Hà Nội',
          group: {
            id: 'group-1',
            title: 'Khách sạn A',
            slug: 'a',
            photos: [],
            amenities: [],
            itemLabel: null,
            provinceCode: '79',
            provinceName: 'TP. Hồ Chí Minh',
            wardCode: '26734',
            wardName: 'Phường Bến Nghé',
            address: '12 Nguyễn Huệ',
            latitude: null,
            longitude: null,
            ratingAvg: null,
            reviewCount: 0,
          },
        }),
      ],
    });

    await expect(
      useCase.execute(HOST, query({ location: ['79'] })),
    ).resolves.toMatchObject({ pagination: { total: 1 } });
    await expect(
      useCase.execute(HOST, query({ location: ['01'] })),
    ).resolves.toMatchObject({ pagination: { total: 0 } });
  });

  it('GROUPS a post’s children into one card, priced at the cheapest', async () => {
    // A hotel with five rooms is one search result, and the price shown is the
    // one the guest can actually get.
    const group = {
      id: 'group-1',
      title: 'Khách sạn A',
      slug: 'khach-san-a',
      photos: [],
      amenities: [],
      itemLabel: 'Phòng',
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
      address: '12 Nguyễn Huệ',
      latitude: null,
      longitude: null,
      ratingAvg: 4.9,
      reviewCount: 40,
    };
    const { useCase } = harness({
      listings: [
        listing({
          id: 'room-1',
          slug: 'room-1',
          group,
          completedBookings: 3,
          modeConfig: { hourly: { basePrice: '900000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 } },
        }),
        listing({
          id: 'room-2',
          slug: 'room-2',
          group,
          completedBookings: 4,
          modeConfig: { hourly: { basePrice: '500000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 } },
        }),
      ],
    });

    const result = await useCase.execute(HOST, query());

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'group-1',
      kind: 'group',
      title: 'Khách sạn A',
      priceFrom: '500000',
      matchingRoomCount: 2,
      // Summed across the children, not taken from the cheapest one.
      completedBookings: 7,
      ratingAvg: 4.9,
    });
  });

  it('lists at most SIX rooms on a grouped card', async () => {
    const group = { id: 'group-1', title: 'A', slug: 'a', photos: [], amenities: [], itemLabel: null, provinceCode: null, provinceName: null, wardCode: null, wardName: null, address: null, latitude: null, longitude: null, ratingAvg: null, reviewCount: 0 };
    const { useCase } = harness({
      listings: Array.from({ length: 8 }, (_, i) =>
        listing({ id: `room-${i}`, slug: `room-${i}`, group }),
      ),
    });

    const result = await useCase.execute(HOST, query());

    expect(result.items[0]?.matchingRoomCount).toBe(8);
    expect(result.items[0]?.rooms).toHaveLength(6);
  });

  it('keeps ungrouped listings as their own cards', async () => {
    const { useCase } = harness({
      listings: [listing(), listing({ id: 'listing-2', slug: 'b' })],
    });

    const result = await useCase.execute(HOST, query());

    expect(result.items.map((i) => i.kind)).toEqual(['listing', 'listing']);
  });

  it('applies the price filter to the CARD price, after grouping', async () => {
    const { useCase } = harness({
      listings: [
        listing({ modeConfig: { hourly: { basePrice: '500000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 } } }),
        listing({ id: 'listing-2', slug: 'b', modeConfig: { hourly: { basePrice: '2000000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 } } }),
      ],
    });

    const cheapOnly = await useCase.execute(HOST, query({ maxPrice: '1000000' }));
    const dearOnly = await useCase.execute(HOST, query({ minPrice: '1000000' }));

    expect(cheapOnly.items.map((i) => i.id)).toEqual(['listing-1']);
    expect(dearOnly.items.map((i) => i.id)).toEqual(['listing-2']);
  });

  it('applies the rating filter, treating an unrated card as zero', async () => {
    const { useCase } = harness({
      listings: [listing({ ratingAvg: 4.8 }), listing({ id: 'listing-2', slug: 'b', ratingAvg: null })],
    });

    const result = await useCase.execute(HOST, query({ minRating: 4 }));

    expect(result.items.map((i) => i.id)).toEqual(['listing-1']);
  });

  it('sorts by bookings, then by price, then by distance for a nearby search', async () => {
    const cheapBusy = listing({
      id: 'a',
      slug: 'a',
      title: 'A',
      completedBookings: 1,
      distanceMeters: 900,
      modeConfig: { hourly: { basePrice: '100000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 } },
    });
    const pricyPopular = listing({
      id: 'b',
      slug: 'b',
      title: 'B',
      completedBookings: 99,
      distanceMeters: 100,
      modeConfig: { hourly: { basePrice: '900000', minDuration: 1, maxDuration: 4, granularity: 60, leadTimeMin: 0 } },
    });
    const byBookings = harness({ listings: [cheapBusy, pricyPopular] });
    const byPrice = harness({ listings: [pricyPopular, cheapBusy] });
    const byDistance = harness({ listings: [cheapBusy, pricyPopular] });

    const bookings = await byBookings.useCase.execute(HOST, query({ sort: 'bookings-desc' }));
    const price = await byPrice.useCase.execute(HOST, query({ sort: 'price-asc' }));
    const nearby = await byDistance.useCase.execute(HOST, query(), {
      latitude: 10.77,
      longitude: 106.7,
      limit: 10,
    });

    expect(bookings.items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(price.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(nearby.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('CLAMPS a page beyond the last one, rather than answering nothing', async () => {
    // A stale deep link must land on the last page, not on an empty screen.
    const { useCase } = harness({
      listings: [listing(), listing({ id: 'listing-2', slug: 'b' })],
    });

    const result = await useCase.execute(HOST, query({ page: 9, pageSize: 1 }));

    expect(result.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(result.items).toHaveLength(1);
  });

  it('reports at least ONE page even with no results', async () => {
    const { useCase } = harness({ listings: [] });

    const result = await useCase.execute(HOST, query());

    expect(result.pagination).toMatchObject({ page: 1, total: 0, totalPages: 1 });
  });

  it('spends NO availability query when the search has no window', async () => {
    // Browsing without dates must not pay for a busy-range scan.
    const { useCase, busyCalls, holdCalls, inventoryCalls } = harness();

    await useCase.execute(HOST, query());

    expect(busyCalls).toEqual([]);
    expect(holdCalls).toEqual([]);
    expect(inventoryCalls).toEqual([]);
  });

  it('reads bookings AND live holds for a dated hourly search', async () => {
    const { useCase, busyCalls, holdCalls, inventoryCalls } = harness();

    await useCase.execute(
      HOST,
      query({ mode: 'hourly', date: '2026-09-10', startTime: '08:00', endTime: '10:00' }),
    );

    expect(busyCalls).toHaveLength(1);
    expect(holdCalls).toHaveLength(1);
    expect(inventoryCalls).toEqual([]);
  });

  it('reads INVENTORY usage instead, and no holds, for an inventory search', async () => {
    // Inventory is a quantity, not a calendar — a hold on the resource says
    // nothing about how many units are left.
    const { useCase, busyCalls, holdCalls, inventoryCalls } = harness({
      type: listingType({ allowedModes: ['inventory'] }),
      listings: [
        listing({
          bookingModes: ['inventory'],
          stockQuantity: 5,
          modeConfig: { inventory: { basePrice: '100000' } },
        }),
      ],
    });

    await useCase.execute(
      HOST,
      query({ mode: 'inventory', from: '2026-09-10', to: '2026-09-12' }),
    );

    expect(inventoryCalls).toHaveLength(1);
    expect(busyCalls).toEqual([]);
    expect(holdCalls).toEqual([]);
  });

  it('echoes the applied query back, with the resolved mode and clamped page', async () => {
    // The storefront renders its filter chips from this, so it has to describe
    // what was actually run.
    const { useCase } = harness();

    const result = await useCase.execute(HOST, query({ page: 5, guests: 4 }));

    expect(result.applied).toMatchObject({ mode: undefined, page: 1, guests: 4 });
    expect(result.sortOptions).toEqual(['relevance', 'bookings-desc', 'price-asc']);
  });

  it('passes the free-text and partner filters down to the query', async () => {
    const { useCase, findArgs } = harness();

    await useCase.execute(HOST, query({ q: 'sân', partner: 'studio-giang' }));

    expect(findArgs[0]).toMatchObject({
      typeSlug: 'san-bong',
      partnerSlug: 'studio-giang',
      q: 'sân',
    });
  });

  it('sends an EMPTY free-text as undefined rather than an empty match', async () => {
    const { useCase, findArgs } = harness();

    await useCase.execute(HOST, query({ q: '' }));

    expect(findArgs[0]?.q).toBeUndefined();
  });
});
