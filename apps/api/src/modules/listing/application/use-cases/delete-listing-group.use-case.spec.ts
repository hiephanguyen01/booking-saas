import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  ListingGroupNotEmpty,
  ListingGroupNotFound,
  ListingGroupNotOwnedForManage,
} from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import { DeleteListingGroupUseCase } from './delete-listing-group.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

const group = (partnerId = PARTNER_ID): ListingGroupRecord =>
  ({
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId,
    status: 'draft',
  }) as unknown as ListingGroupRecord;

function harness(record: ListingGroupRecord | null, count = 0) {
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
    useCase: new DeleteListingGroupUseCase(
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(record),
        countListings: () => Promise.resolve(count),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    deleted,
    events,
  };
}

describe('DeleteListingGroupUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it("refuses another partner's post", async () => {
    const { useCase, deleted } = harness(group('partner-2'));

    await expect(
      useCase.execute(TENANT_ID, GROUP_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingGroupNotOwnedForManage);
    expect(deleted).toEqual([]);
  });

  it('refuses while the post still holds items', async () => {
    // The items would be orphaned: they are only reachable through their post.
    const { useCase, deleted } = harness(group(), 2);

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotEmpty);
    expect(deleted).toEqual([]);
  });

  it('deletes an empty post and announces it', async () => {
    const { useCase, tenantDb, deleted, events } = harness(group(), 0);

    await useCase.execute(TENANT_ID, GROUP_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([GROUP_ID]);
    expect(events).toEqual([
      { eventType: 'listing_group.deleted', payload: { listingGroupId: GROUP_ID } },
    ]);
  });
});
