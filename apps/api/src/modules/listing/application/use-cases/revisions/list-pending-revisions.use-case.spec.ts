import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { ListPendingRevisionsUseCase } from './list-pending-revisions.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

const listing = (id: string, partnerId = PARTNER_ID): ListingRecord =>
  ({ id, tenantId: TENANT_ID, partnerId, title: `Listing ${id}` }) as unknown as ListingRecord;

const group = (id: string, partnerId = PARTNER_ID): ListingGroupRecord =>
  ({ id, tenantId: TENANT_ID, partnerId, title: `Group ${id}` }) as unknown as ListingGroupRecord;

const revision = (targetType: string, targetId: string) =>
  ({
    id: `revision-${targetId}`,
    tenantId: TENANT_ID,
    targetType,
    targetId,
    status: 'pending',
    payload: { title: 'Đổi tên' },
    submittedAt: new Date('2026-08-01T00:00:00Z'),
    reviewedAt: null,
    reviewNote: null,
    appliedAt: null,
  }) as never;

interface Options {
  pending?: unknown[];
  listings?: ListingRecord[];
  groups?: ListingGroupRecord[];
}

function harness(options: Options = {}) {
  const lookups: Array<{ kind: string; ids: readonly string[] }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPendingRevisionsUseCase(
      fakePort<IListingRevisionRepository>({
        listPending: () => Promise.resolve((options.pending ?? []) as never),
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

describe('ListPendingRevisionsUseCase', () => {
  it('answers an empty queue without looking anything up', async () => {
    const { useCase, lookups } = harness({ pending: [] });

    await expect(useCase.execute(TENANT_ID)).resolves.toEqual([]);
    expect(lookups).toEqual([]);
  });

  it('resolves listings and posts in TWO batched lookups, not one per row', async () => {
    // The queue drives a table; a lookup per row is what this read exists to avoid.
    const { useCase, tenantDb, lookups } = harness({
      pending: [
        revision('listing', 'listing-1'),
        revision('listing', 'listing-2'),
        revision('listing_group', 'group-1'),
      ],
      listings: [listing('listing-1'), listing('listing-2')],
      groups: [group('group-1')],
    });

    const rows = await useCase.execute(TENANT_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(lookups).toEqual([
      { kind: 'listings', ids: ['listing-1', 'listing-2'] },
      { kind: 'groups', ids: ['group-1'] },
    ]);
    expect(rows).toHaveLength(3);
  });

  it('drops a revision whose target has been deleted', async () => {
    // A ghost row in the moderation queue cannot be acted on and never clears.
    const { useCase } = harness({
      pending: [revision('listing', 'listing-1'), revision('listing', 'gone')],
      listings: [listing('listing-1')],
    });

    const rows = await useCase.execute(TENANT_ID);

    expect(rows.map((row) => row.targetId)).toEqual(['listing-1']);
  });

  it("narrows to one partner's own rows when scoped", async () => {
    // The same list backs the tenant moderation queue and the partner's own
    // "waiting for review" chip; the partner scope is what separates them.
    const { useCase } = harness({
      pending: [
        revision('listing', 'listing-1'),
        revision('listing', 'listing-2'),
        revision('listing_group', 'group-1'),
      ],
      listings: [listing('listing-1'), listing('listing-2', 'partner-2')],
      groups: [group('group-1', 'partner-2')],
    });

    const rows = await useCase.execute(TENANT_ID, { partnerId: PARTNER_ID });

    expect(rows.map((row) => row.targetId)).toEqual(['listing-1']);
  });

  it('carries the live title so the queue reads without a second request', async () => {
    const { useCase } = harness({
      pending: [revision('listing_group', 'group-1')],
      groups: [group('group-1')],
    });

    expect((await useCase.execute(TENANT_ID))[0]).toMatchObject({
      targetType: 'listing_group',
      targetTitle: 'Group group-1',
    });
  });
});
