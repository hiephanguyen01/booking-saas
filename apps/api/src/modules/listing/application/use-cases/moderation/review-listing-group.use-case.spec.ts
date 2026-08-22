import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingGroupNotFound } from '../../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { ReviewListingGroupUseCase } from './review-listing-group.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

function group(overrides: Record<string, unknown> = {}): ListingGroupRecord {
  return {
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    status: 'pending_review',
    title: 'Khách sạn A',
    description: 'Khách sạn ven biển, phòng rộng.',
    photos: ['https://cdn.example/hotel.jpg'],
    ...overrides,
  } as unknown as ListingGroupRecord;
}

function child(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: 'listing-1',
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    groupId: GROUP_ID,
    status: 'pending_review',
    title: 'Phòng Deluxe',
    description: 'Phòng hướng biển, có ban công.',
    photos: ['https://cdn.example/room.jpg'],
    bookingModes: ['daily'],
    bookingSelection: 'flexible_duration',
    modeConfig: { daily: { basePricePerNight: '900000', leadTimeMin: 0 } },
    effectiveCancellationPolicy: { id: 'policy-1', rules: [] },
    ...overrides,
  } as unknown as ListingRecord;
}

interface Options {
  record?: ListingGroupRecord | null;
  children?: ListingRecord[];
  groupRevision?: Record<string, unknown> | null;
  childRevisions?: Array<{ targetId: string; payload: Record<string, unknown> }>;
}

function harness(options: Options = {}) {
  const listArgs: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ReviewListingGroupUseCase(
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(options.record === undefined ? group() : options.record),
      }),
      fakePort<IListingRepository>({
        list: (_tx, filter) => {
          listArgs.push(filter);
          return Promise.resolve(options.children ?? [child()]);
        },
      }),
      fakePort<IListingRevisionRepository>({
        findPending: () =>
          Promise.resolve(
            (options.groupRevision ? { payload: options.groupRevision } : null) as never,
          ),
        findPendingForTargets: () => Promise.resolve((options.childRevisions ?? []) as never),
      }),
      tenantDb.service,
    ),
    tenantDb,
    listArgs,
  };
}

describe('ReviewListingGroupUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it('reviews the post together with every item it would publish', async () => {
    const { useCase, tenantDb, listArgs } = harness({
      children: [child(), child({ id: 'listing-2' })],
    });

    const review = await useCase.execute(TENANT_ID, GROUP_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listArgs).toEqual([{ groupId: GROUP_ID, partnerId: PARTNER_ID }]);
    expect(review.contactFlags).toEqual([]);
  });

  it('screens a waiting edit on the POST as the content it would become', async () => {
    const { useCase } = harness({ groupRevision: { description: 'Gọi 0901234567 để đặt' } });

    expect((await useCase.execute(TENANT_ID, GROUP_ID)).contactFlags.length).toBeGreaterThan(0);
  });

  it('screens a waiting edit on an ITEM too', async () => {
    // Approving the post publishes the items with it, so an edit parked on a
    // child is content this review is about to release.
    const { useCase } = harness({
      childRevisions: [{ targetId: 'listing-1', payload: { description: 'Zalo 0901234567' } }],
    });

    expect((await useCase.execute(TENANT_ID, GROUP_ID)).contactFlags.length).toBeGreaterThan(0);
  });

  it('leaves an item with no waiting edit untouched', async () => {
    const { useCase } = harness({
      children: [child(), child({ id: 'listing-2' })],
      childRevisions: [{ targetId: 'listing-2', payload: { title: 'Phòng Suite' } }],
    });

    expect((await useCase.execute(TENANT_ID, GROUP_ID)).contactFlags).toEqual([]);
  });
});
