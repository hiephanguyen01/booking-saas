import { describe, expect, it } from 'vitest';
import type { UpdateListingGroupInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import {
  InvalidListingAdministrativeDivision,
  ListingStateChanged,
} from '../../domain/errors/listing-errors';
import {
  ListingGroupNotFound,
  ListingGroupNotOwnedForManage,
  ListingGroupSlugTaken,
} from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import { ApplyListingGroupUpdateUseCase } from './apply-listing-group-update.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

const group = (overrides: Record<string, unknown> = {}): ListingGroupRecord =>
  ({
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    listingTypeId: 'type-1',
    slug: 'khach-san-a',
    title: 'Khách sạn A',
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  }) as unknown as ListingGroupRecord;

interface Options {
  record?: ListingGroupRecord | null;
  bySlug?: ListingGroupRecord | null;
  updated?: ListingGroupRecord | null;
}

function harness(options: Options = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const expectedStamps: unknown[] = [];
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
    useCase: new ApplyListingGroupUpdateUseCase(
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(options.record === undefined ? group() : options.record),
        findBySlug: () => Promise.resolve(options.bySlug ?? null),
        update: (_tx, _id, expectedUpdatedAt, patch) => {
          expectedStamps.push(expectedUpdatedAt);
          patches.push(patch as unknown as Record<string, unknown>);
          return Promise.resolve(
            (options.updated === undefined ? group() : options.updated) as never,
          );
        },
      }),
      fakeCollaborator<ResolveAdministrativeAddressUseCase>({
        execute: () =>
          Promise.resolve({
            province: { code: '79', name: 'TP. Hồ Chí Minh' },
            ward: { code: '26734', name: 'Phường Bến Nghé' },
          }),
      }),
      new OutboxService(),
    ),
    tx: tenantDb.tx,
    patches,
    expectedStamps,
    events,
  };
}

describe('ApplyListingGroupUpdateUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase, tx, patches } = harness({ record: null });

    await expect(
      useCase.execute(tx, TENANT_ID, GROUP_ID, { title: 'Mới' } as UpdateListingGroupInput),
    ).rejects.toBeInstanceOf(ListingGroupNotFound);
    expect(patches).toEqual([]);
  });

  it("refuses another partner's post on a partner-scoped call", async () => {
    const { useCase, tx } = harness({ record: group({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute(tx, TENANT_ID, GROUP_ID, {} as UpdateListingGroupInput, {
        requirePartnerId: PARTNER_ID,
      }),
    ).rejects.toBeInstanceOf(ListingGroupNotOwnedForManage);
  });

  it.each([
    ['province without ward', { provinceCode: '79' }],
    ['ward without province', { wardCode: '26734' }],
  ])('refuses a half-specified address (%s)', async (_label, patch) => {
    // The pair identifies the address; accepting half would leave the stored
    // province and ward describing different places.
    const { useCase, tx, patches } = harness();

    await expect(
      useCase.execute(tx, TENANT_ID, GROUP_ID, patch as UpdateListingGroupInput),
    ).rejects.toBeInstanceOf(InvalidListingAdministrativeDivision);
    expect(patches).toEqual([]);
  });

  it('re-resolves and freezes both names when the address changes', async () => {
    const { useCase, tx, patches } = harness();

    await useCase.execute(tx, TENANT_ID, GROUP_ID, {
      provinceCode: '79',
      wardCode: '26734',
    } as UpdateListingGroupInput);

    expect(patches[0]).toMatchObject({
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Bến Nghé',
    });
  });

  it('leaves the address untouched when the patch does not mention it', async () => {
    const { useCase, tx, patches } = harness();

    await useCase.execute(tx, TENANT_ID, GROUP_ID, { title: 'Mới' } as UpdateListingGroupInput);

    expect(patches[0]).toMatchObject({
      provinceCode: undefined,
      provinceName: undefined,
      wardCode: undefined,
      wardName: undefined,
    });
  });

  it('refuses a slug another post already uses', async () => {
    const { useCase, tx, patches } = harness({ bySlug: group({ id: 'group-2' }) });

    await expect(
      useCase.execute(tx, TENANT_ID, GROUP_ID, { slug: 'khach-san-b' } as UpdateListingGroupInput),
    ).rejects.toBeInstanceOf(ListingGroupSlugTaken);
    expect(patches).toEqual([]);
  });

  it('accepts the post keeping its OWN slug', async () => {
    // The uniqueness lookup finds this very row; treating that as a conflict would
    // make any edit that echoes the slug back impossible.
    const { useCase, tx, patches } = harness({ bySlug: group() });

    await useCase.execute(tx, TENANT_ID, GROUP_ID, {
      slug: 'khach-san-b',
    } as UpdateListingGroupInput);

    expect(patches).toHaveLength(1);
  });

  it('refuses a PARTNER moving the post to another partner or type', async () => {
    // Both are dropped from the patch on a partner-scoped call, so the values
    // never reach the repository.
    const { useCase, tx, patches } = harness();

    await useCase.execute(
      tx,
      TENANT_ID,
      GROUP_ID,
      { partnerId: 'partner-2', listingTypeId: 'type-2' } as UpdateListingGroupInput,
      { requirePartnerId: PARTNER_ID },
    );

    expect(patches[0]).toMatchObject({ partnerId: undefined, listingTypeId: undefined });
  });

  it('lets the TENANT console move the post', async () => {
    const { useCase, tx, patches } = harness();

    await useCase.execute(tx, TENANT_ID, GROUP_ID, {
      partnerId: 'partner-2',
      listingTypeId: 'type-2',
    } as UpdateListingGroupInput);

    expect(patches[0]).toMatchObject({ partnerId: 'partner-2', listingTypeId: 'type-2' });
  });

  it('writes with an optimistic-concurrency stamp and announces the change', async () => {
    const { useCase, tx, expectedStamps, events } = harness();

    await useCase.execute(tx, TENANT_ID, GROUP_ID, { title: 'Mới' } as UpdateListingGroupInput);

    expect(expectedStamps).toEqual([new Date('2026-08-01T00:00:00Z')]);
    expect(events).toEqual([
      { eventType: 'listing_group.updated', payload: { listingGroupId: GROUP_ID } },
    ]);
  });

  it('fails when the row changed under it', async () => {
    const { useCase, tx, events } = harness({ updated: null });

    await expect(
      useCase.execute(tx, TENANT_ID, GROUP_ID, { title: 'Mới' } as UpdateListingGroupInput),
    ).rejects.toBeInstanceOf(ListingStateChanged);
    expect(events).toEqual([]);
  });
});
