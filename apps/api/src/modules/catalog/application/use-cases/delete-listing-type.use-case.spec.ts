import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { DeleteListingTypeUseCase } from './delete-listing-type.use-case';

const TENANT_ID = 'tenant-1';
const TYPE_ID = 'type-1';

function harness(record: ListingTypeRecord | null, inUse = 0) {
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
    useCase: new DeleteListingTypeUseCase(
      fakePort<IListingTypeRepository>({
        findById: () => Promise.resolve(record),
        countListingsOfType: () => Promise.resolve(inUse),
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

describe('DeleteListingTypeUseCase', () => {
  it('answers 404 for a type this tenant does not have', async () => {
    const { useCase, deleted } = harness(null);

    await expect(useCase.execute(TENANT_ID, TYPE_ID)).rejects.toBeInstanceOf(ListingTypeNotFound);
    expect(deleted).toEqual([]);
  });

  it('refuses while any listing still uses the type', async () => {
    // Deleting it would leave listings pointing at a type that defines their whole
    // attribute schema and booking modes.
    const { useCase, deleted } = harness({ id: TYPE_ID } as ListingTypeRecord, 3);

    await expect(useCase.execute(TENANT_ID, TYPE_ID)).rejects.toThrow();
    expect(deleted).toEqual([]);
  });

  it('deletes an unused type and announces it', async () => {
    const { useCase, tenantDb, deleted, events } = harness({ id: TYPE_ID } as ListingTypeRecord, 0);

    await useCase.execute(TENANT_ID, TYPE_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([TYPE_ID]);
    expect(events).toEqual([
      { eventType: 'listing_type.deleted', payload: { listingTypeId: TYPE_ID } },
    ]);
  });
});
