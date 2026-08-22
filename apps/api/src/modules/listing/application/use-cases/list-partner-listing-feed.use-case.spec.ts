import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IListingFeedRepository,
  ListingFeedFilter,
} from '../../domain/ports/listing-feed-repository.port';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import { ListPartnerListingFeedUseCase } from './list-partner-listing-feed.use-case';

const TENANT_ID = 'tenant-1';

const listing = (id: string): ListingRecord =>
  ({ id, tenantId: TENANT_ID, title: `Listing ${id}` }) as unknown as ListingRecord;

const group = (id: string): ListingGroupRecord =>
  ({ id, tenantId: TENANT_ID, title: `Group ${id}` }) as unknown as ListingGroupRecord;

interface Options {
  keys?: Array<{ kind: 'single' | 'grouped'; id: string }>;
  total?: number;
  listings?: ListingRecord[];
  groups?: ListingGroupRecord[];
}

function harness(options: Options = {}) {
  const lookups: Array<{ kind: string; ids: readonly string[] }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPartnerListingFeedUseCase(
      fakePort<IListingFeedRepository>({
        listPage: () =>
          Promise.resolve({
            keys: options.keys ?? [],
            total: options.total ?? (options.keys ?? []).length,
          } as never),
      }),
      fakePort<IListingRepository>({
        findByIds: (_tx, ids) => {
          lookups.push({ kind: 'listings', ids });
          return Promise.resolve(options.listings ?? []);
        },
      }),
      fakePort<IListingGroupRepository>({
        findByIds: (_tx, ids) => {
          lookups.push({ kind: 'groups', ids });
          return Promise.resolve(options.groups ?? []);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    lookups,
  };
}

const filter = { partnerId: 'partner-1' } as unknown as ListingFeedFilter;
const page = { page: 1, pageSize: 20 };

describe('ListPartnerListingFeedUseCase', () => {
  it('keeps the ORDER the key query established, not the load order', async () => {
    // The feed is a union of two tables; the key query is what makes one global
    // ordering possible, and rebuilding from the bulk loads would scramble it.
    const { useCase, tenantDb } = harness({
      keys: [
        { kind: 'grouped', id: 'group-1' },
        { kind: 'single', id: 'listing-1' },
        { kind: 'grouped', id: 'group-2' },
      ],
      listings: [listing('listing-1')],
      groups: [group('group-2'), group('group-1')],
    });

    const result = await useCase.execute(TENANT_ID, filter, page);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result.items.map((item) => item.item.id)).toEqual(['group-1', 'listing-1', 'group-2']);
  });

  it('bulk-loads each kind ONCE rather than a query per row', async () => {
    const { useCase, lookups } = harness({
      keys: [
        { kind: 'single', id: 'listing-1' },
        { kind: 'single', id: 'listing-2' },
        { kind: 'grouped', id: 'group-1' },
      ],
      listings: [listing('listing-1'), listing('listing-2')],
      groups: [group('group-1')],
    });

    await useCase.execute(TENANT_ID, filter, page);

    expect(lookups).toEqual([
      { kind: 'listings', ids: ['listing-1', 'listing-2'] },
      { kind: 'groups', ids: ['group-1'] },
    ]);
  });

  it('keeps the total from the key query even when a row cannot be loaded', async () => {
    // The count is the page's, not the loaded array's — recomputing it from the
    // items would make the pager jump when a row vanishes mid-request.
    const { useCase } = harness({
      keys: [
        { kind: 'single', id: 'listing-1' },
        { kind: 'single', id: 'gone' },
      ],
      total: 57,
      listings: [listing('listing-1')],
    });

    const result = await useCase.execute(TENANT_ID, filter, page);

    expect(result.total).toBe(57);
    expect(result.items).toHaveLength(1);
  });

  it('tags each row with its kind so the client can render the right card', async () => {
    const { useCase } = harness({
      keys: [
        { kind: 'single', id: 'listing-1' },
        { kind: 'grouped', id: 'group-1' },
      ],
      listings: [listing('listing-1')],
      groups: [group('group-1')],
    });

    const result = await useCase.execute(TENANT_ID, filter, page);

    expect(result.items.map((item) => item.kind)).toEqual(['single', 'grouped']);
  });

  it('answers an empty page without loading anything', async () => {
    const { useCase, lookups } = harness({ keys: [] });

    const result = await useCase.execute(TENANT_ID, filter, page);

    expect(result.items).toEqual([]);
    expect(lookups).toEqual([
      { kind: 'listings', ids: [] },
      { kind: 'groups', ids: [] },
    ]);
  });
});
