import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  ListingHasBookings,
  ListingNotFound,
  ListingNotOwnedForDelete,
} from '../../domain/errors/listing-errors';
import { ListingGroupReadOnlyForDelete } from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import { DeleteListingUseCase } from './delete-listing.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

const listing = (overrides: Record<string, unknown> = {}): ListingRecord =>
  ({
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    groupId: null,
    ...overrides,
  }) as unknown as ListingRecord;

const group = (status = 'draft'): ListingGroupRecord =>
  ({
    id: 'group-1',
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    status,
  }) as unknown as ListingGroupRecord;

interface Options {
  record?: ListingRecord | null;
  groupRecord?: ListingGroupRecord | null;
  bookings?: number;
}

function harness(options: Options = {}) {
  const deleted: string[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new DeleteListingUseCase(
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(options.record === undefined ? listing() : options.record),
        countBookings: () => Promise.resolve(options.bookings ?? 0),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      fakePort<IListingGroupRepository>({
        findById: () =>
          Promise.resolve(options.groupRecord === undefined ? group() : options.groupRecord),
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    deleted,
    events,
  };
}

describe('DeleteListingUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, deleted } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).rejects.toBeInstanceOf(ListingNotFound);
    expect(deleted).toEqual([]);
  });

  it("refuses another partner's listing", async () => {
    const { useCase } = harness({ record: listing({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingNotOwnedForDelete);
  });

  it('refuses while the listing still has bookings', async () => {
    // §7.3 — a deleted listing would orphan the bookings that reference it.
    const { useCase, deleted } = harness({ bookings: 3 });

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).rejects.toBeInstanceOf(ListingHasBookings);
    expect(deleted).toEqual([]);
  });

  it('deletes an unused listing and announces it', async () => {
    const { useCase, tenantDb, deleted, events } = harness();

    await useCase.execute(TENANT_ID, LISTING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([LISTING_ID]);
    expect(events).toEqual([{ eventType: 'listing.deleted', payload: { listingId: LISTING_ID } }]);
  });

  it('refuses a partner deleting an item out of a post that is locked', async () => {
    // A published post is a unit; pulling an item out of it from the partner side
    // would change what a reviewer already approved.
    const { useCase, deleted } = harness({
      record: listing({ groupId: 'group-1' }),
      groupRecord: group('published'),
    });

    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toThrow();
    expect(deleted).toEqual([]);
  });

  it('refuses when the parent post cannot be read at all', async () => {
    const { useCase } = harness({
      record: listing({ groupId: 'group-1' }),
      groupRecord: null,
    });

    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingGroupReadOnlyForDelete);
  });

  it('lets a TENANT-scoped caller delete a grouped item without the post check', async () => {
    // The group lock is a partner-side rule; the tenant console is the authority
    // that would have approved the post in the first place.
    const { useCase, deleted } = harness({
      record: listing({ groupId: 'group-1' }),
      groupRecord: group('published'),
    });

    await useCase.execute(TENANT_ID, LISTING_ID);

    expect(deleted).toEqual([LISTING_ID]);
  });
});
