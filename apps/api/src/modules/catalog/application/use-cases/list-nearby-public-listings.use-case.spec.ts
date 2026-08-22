import { describe, expect, it } from 'vitest';
import type { NearbyPublicListingsInput } from '@booking/contracts';
import { fakeCollaborator } from '~testing';
import type { SearchPublicCatalogUseCase } from './search-public-catalog.use-case';
import { ListNearbyPublicListingsUseCase } from './list-nearby-public-listings.use-case';

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'listing-1',
  kind: 'listing',
  title: 'Sân bóng số 1',
  slug: 'san-bong-so-1',
  listingTypeSlug: 'san-bong',
  photos: ['https://cdn/a.jpg'],
  priceFrom: '500000',
  regularPriceFrom: '600000',
  priceUnit: 'giờ',
  completedBookings: 12,
  ratingAvg: 4.8,
  reviewCount: 9,
  address: '12 Nguyễn Huệ',
  provinceCode: '79',
  provinceName: 'TP. Hồ Chí Minh',
  wardCode: '26734',
  wardName: 'Phường Bến Nghé',
  distanceMeters: 1200,
  // Deliberately present on the search result and NOT on the nearby response.
  description: 'không nên lộ ra',
  ...overrides,
});

function harness(items: Array<Record<string, unknown>>) {
  const calls: Array<{ host: string; query: Record<string, unknown>; geo: unknown }> = [];
  return {
    useCase: new ListNearbyPublicListingsUseCase(
      fakeCollaborator<SearchPublicCatalogUseCase>({
        execute: (host: unknown, query: unknown, geo: unknown) => {
          calls.push({
            host: host as string,
            query: query as Record<string, unknown>,
            geo,
          });
          return Promise.resolve({ items } as never);
        },
      }),
    ),
    calls,
  };
}

const input = (overrides: Partial<NearbyPublicListingsInput> = {}) =>
  ({ latitude: 10.77, longitude: 106.7, ...overrides }) as NearbyPublicListingsInput;

describe('ListNearbyPublicListingsUseCase', () => {
  it('searches with an EMPTY filter set, so only distance ranks the result', async () => {
    // Any leftover filter would silently narrow "near me" to something else.
    const { useCase, calls } = harness([item()]);

    await useCase.execute('studiohub.vn', input());

    expect(calls[0]?.host).toBe('studiohub.vn');
    expect(calls[0]?.query).toMatchObject({
      q: '',
      location: [],
      amenities: [],
      attributes: {},
      attributeRanges: {},
      partner: undefined,
      mode: undefined,
      date: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minRating: undefined,
      sort: 'relevance',
    });
  });

  it('passes the caller’s coordinates and caps the result at ten', async () => {
    const { useCase, calls } = harness([item()]);

    await useCase.execute('studiohub.vn', input({ latitude: 21.03, longitude: 105.85 }));

    expect(calls[0]?.geo).toEqual({ latitude: 21.03, longitude: 105.85, limit: 10 });
  });

  it('keeps the type filter when one was asked for', async () => {
    const { useCase, calls } = harness([item()]);

    await useCase.execute('studiohub.vn', input({ type: 'san-bong' }));

    expect(calls[0]?.query).toMatchObject({ type: 'san-bong' });
  });

  it('DROPS a result with no distance — it is not "nearby"', async () => {
    // A row the geo query could not measure would otherwise appear in a list
    // sorted by a distance it does not have.
    const { useCase } = harness([item(), item({ id: 'listing-2', distanceMeters: undefined })]);

    const result = await useCase.execute('studiohub.vn', input());

    expect(result.items.map((i) => i.id)).toEqual(['listing-1']);
  });

  it('keeps a ZERO distance — that is the nearest possible result', async () => {
    const { useCase } = harness([item({ distanceMeters: 0 })]);

    const result = await useCase.execute('studiohub.vn', input());

    expect(result.items).toHaveLength(1);
  });

  it('projects only the card fields, dropping the rest of the search row', async () => {
    const { useCase } = harness([item()]);

    const result = await useCase.execute('studiohub.vn', input());

    expect(result.items[0]).toEqual({
      id: 'listing-1',
      kind: 'listing',
      title: 'Sân bóng số 1',
      slug: 'san-bong-so-1',
      listingTypeSlug: 'san-bong',
      photos: ['https://cdn/a.jpg'],
      priceFrom: '500000',
      regularPriceFrom: '600000',
      priceUnit: 'giờ',
      completedBookings: 12,
      ratingAvg: 4.8,
      reviewCount: 9,
      address: '12 Nguyễn Huệ',
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
      distanceMeters: 1200,
    });
  });
});
