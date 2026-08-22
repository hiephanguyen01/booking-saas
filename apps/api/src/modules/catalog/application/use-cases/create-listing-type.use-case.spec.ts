import { describe, expect, it } from 'vitest';
import type { CreateListingTypeInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingTypeSlugTaken } from '../../domain/errors/listing-type-errors';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { CreateListingTypeUseCase } from './create-listing-type.use-case';

const TENANT_ID = 'tenant-1';

function harness(existing: ListingTypeRecord | null = null) {
  const created: Array<{ slug: string }> = [];
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
    useCase: new CreateListingTypeUseCase(
      fakePort<IListingTypeRepository>({
        findBySlug: () => Promise.resolve(existing),
        create: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve({ id: 'type-1', ...data } as unknown as ListingTypeRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    created,
    events,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    name: 'Studio chụp ảnh',
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    attributeSchema: [],
    searchConfig: {
      schedule: 'none',
      showGuests: false,
      systemFacets: ['price', 'location'],
      attributeFacets: [],
    },
    sortOrder: 0,
    isActive: true,
    requiresIdentityVerification: false,
    structure: 'single',
    taxCategory: 'standard',
    ...overrides,
  }) as unknown as CreateListingTypeInput;

describe('CreateListingTypeUseCase', () => {
  it('derives a slug from the name when none is given', async () => {
    // Suffixed with random characters, so two types with the same Vietnamese name
    // do not collide on the tenant's unique index.
    const { useCase, tenantDb, created } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]?.slug).toMatch(/^studio-chup-anh-[0-9a-f]{6}$/);
  });

  it('honours an explicitly chosen slug', async () => {
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, input({ slug: 'studio' }));

    expect(created[0]?.slug).toBe('studio');
  });

  it('rejects a slug the tenant already uses', async () => {
    const { useCase, created } = harness({ id: 'type-existing' } as ListingTypeRecord);

    await expect(useCase.execute(TENANT_ID, input({ slug: 'studio' }))).rejects.toBeInstanceOf(
      ListingTypeSlugTaken,
    );
    expect(created).toEqual([]);
  });

  it('announces the new type in the same transaction', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(events).toEqual([
      { eventType: 'listing_type.created', payload: { listingTypeId: 'type-1' } },
    ]);
  });
});
