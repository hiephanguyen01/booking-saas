import { describe, expect, it } from 'vitest';
import type { UpdateListingTypeInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  BookingSelectionLocked,
  ListingTypeSlugTaken,
} from '../../domain/errors/listing-type-errors';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';
import { UpdateListingTypeUseCase } from './update-listing-type.use-case';

const TENANT_ID = 'tenant-1';
const TYPE_ID = 'type-1';

const stored = (overrides: Record<string, unknown> = {}): ListingTypeRecord =>
  ({
    id: TYPE_ID,
    name: 'Sân bóng',
    slug: 'san-bong',
    icon: null,
    iconImageUrl: null,
    allowedModes: ['hourly'],
    defaultModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    attributeSchema: [],
    searchConfig: { schedule: 'none', attributeFacets: [] },
    unitLabel: 'giờ',
    sortOrder: 1,
    isActive: true,
    requiresIdentityVerification: false,
    structure: 'standalone',
    listingCount: 0,
    ...overrides,
  }) as unknown as ListingTypeRecord;

interface Options {
  existing?: ListingTypeRecord | null;
  clash?: ListingTypeRecord | null;
}

function harness(options: Options = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const slugLookups: string[] = [];
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
    useCase: new UpdateListingTypeUseCase(
      fakePort<IListingTypeRepository>({
        findById: () => Promise.resolve(options.existing === undefined ? stored() : options.existing),
        findBySlug: (_tx, slug) => {
          slugLookups.push(slug);
          return Promise.resolve(options.clash ?? null);
        },
        update: (_tx, id, patch) => {
          patches.push(patch as Record<string, unknown>);
          return Promise.resolve({ ...stored(), id, ...patch } as ListingTypeRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    patches,
    slugLookups,
    events,
  };
}

const input = (overrides: Partial<UpdateListingTypeInput> = {}) =>
  overrides as UpdateListingTypeInput;

describe('UpdateListingTypeUseCase', () => {
  it('answers not-found for a type this tenant does not have', async () => {
    const { useCase, patches } = harness({ existing: null });

    await expect(
      useCase.execute(TENANT_ID, TYPE_ID, input({ name: 'Mới' })),
    ).rejects.toBeInstanceOf(ListingTypeNotFound);
    expect(patches).toEqual([]);
  });

  it('refuses a slug another type already holds', async () => {
    const { useCase, patches } = harness({ clash: stored({ id: 'type-2' }) });

    await expect(
      useCase.execute(TENANT_ID, TYPE_ID, input({ slug: 'san-tennis' })),
    ).rejects.toBeInstanceOf(ListingTypeSlugTaken);
    expect(patches).toEqual([]);
  });

  it('does not report the type as clashing with ITSELF', async () => {
    const { useCase, patches } = harness({ clash: stored() });

    await useCase.execute(TENANT_ID, TYPE_ID, input({ slug: 'san-tennis' }));

    expect(patches).toHaveLength(1);
  });

  it('skips the slug lookup when the slug did not change', async () => {
    const { useCase, slugLookups } = harness({ clash: stored({ id: 'type-2' }) });

    await useCase.execute(TENANT_ID, TYPE_ID, input({ slug: 'san-bong' }));

    expect(slugLookups).toEqual([]);
  });

  it('LOCKS the booking selection once listings exist', async () => {
    // Every listing's mode config was written against the current selection;
    // changing it would invalidate all of them at once.
    const { useCase, patches } = harness({ existing: stored({ listingCount: 3 }) });

    await expect(
      useCase.execute(TENANT_ID, TYPE_ID, input({ bookingSelection: 'fixed_packages' })),
    ).rejects.toBeInstanceOf(BookingSelectionLocked);
    expect(patches).toEqual([]);
  });

  it('allows the selection change while the type is unused', async () => {
    const { useCase, patches } = harness();

    await useCase.execute(TENANT_ID, TYPE_ID, input({ bookingSelection: 'fixed_packages' }));

    expect(patches[0]).toMatchObject({ bookingSelection: 'fixed_packages' });
  });

  it('re-submitting the SAME selection is not a change', async () => {
    const { useCase, patches } = harness({ existing: stored({ listingCount: 3 }) });

    await useCase.execute(TENANT_ID, TYPE_ID, input({ bookingSelection: 'flexible_duration' }));

    expect(patches).toHaveLength(1);
  });

  it('validates the MERGED mode rules, not the patch alone', async () => {
    // Narrowing `allowedModes` while leaving a default outside it would leave
    // the type defaulting to a mode it no longer offers.
    const { useCase, patches } = harness({
      existing: stored({ allowedModes: ['hourly', 'daily'], defaultModes: ['daily'] }),
    });

    await expect(
      useCase.execute(TENANT_ID, TYPE_ID, input({ allowedModes: ['hourly'] })),
    ).rejects.toThrow();
    expect(patches).toEqual([]);
  });

  it('leaves an untouched key undefined so the column is not rewritten', async () => {
    const { useCase, patches, tenantDb } = harness();

    await useCase.execute(TENANT_ID, TYPE_ID, input({ name: 'Tên mới' }));

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(patches[0]).toMatchObject({ name: 'Tên mới', slug: undefined, isActive: undefined });
  });

  it('announces the change so cached catalog reads are dropped', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, TYPE_ID, input({ name: 'Tên mới' }));

    expect(events).toEqual([
      { eventType: 'listing_type.updated', payload: { listingTypeId: TYPE_ID } },
    ]);
  });
});
