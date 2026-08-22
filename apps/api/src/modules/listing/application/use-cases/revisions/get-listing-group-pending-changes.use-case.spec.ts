import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  ListingGroupNotFound,
  ListingGroupNotOwnedForManage,
} from '../../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { GetListingGroupPendingChangesUseCase } from './get-listing-group-pending-changes.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

const group = (partnerId = PARTNER_ID): ListingGroupRecord =>
  ({
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId,
    title: 'Khách sạn A',
  }) as unknown as ListingGroupRecord;

const child = (id: string): ListingRecord =>
  ({
    id,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    groupId: GROUP_ID,
    title: `Phòng ${id}`,
  }) as unknown as ListingRecord;

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
  record?: ListingGroupRecord | null;
  children?: ListingRecord[];
  groupRevision?: unknown;
  childRevisions?: unknown[];
}

function harness(options: Options = {}) {
  const listArgs: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingGroupPendingChangesUseCase(
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(options.record === undefined ? group() : options.record),
      }),
      fakePort<IListingRepository>({
        list: (_tx, filter) => {
          listArgs.push(filter);
          return Promise.resolve(options.children ?? [child('listing-1')]);
        },
      }),
      fakePort<IListingRevisionRepository>({
        findPending: () => Promise.resolve((options.groupRevision ?? null) as never),
        findPendingForTargets: () => Promise.resolve((options.childRevisions ?? []) as never),
      }),
      tenantDb.service,
    ),
    tenantDb,
    listArgs,
  };
}

describe('GetListingGroupPendingChangesUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it("refuses another partner's post on a partner-scoped call", async () => {
    const { useCase } = harness({ record: group('partner-2') });

    await expect(
      useCase.execute(TENANT_ID, GROUP_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingGroupNotOwnedForManage);
  });

  it('reads the post edit and every item edit as ONE unit', async () => {
    // Posts are moderated at the post level, so the reviewer needs both halves in
    // one response and approves them together.
    const { useCase, tenantDb, listArgs } = harness({
      children: [child('listing-1'), child('listing-2')],
      groupRevision: revision('listing_group', GROUP_ID),
      childRevisions: [revision('listing', 'listing-2')],
    });

    const result = await useCase.execute(TENANT_ID, GROUP_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listArgs).toEqual([{ groupId: GROUP_ID, partnerId: PARTNER_ID }]);
    expect(result.group).toMatchObject({ targetType: 'listing_group', targetId: GROUP_ID });
    expect(result.listings.map((row) => row.targetId)).toEqual(['listing-2']);
  });

  it('answers a null post edit when only items changed', async () => {
    const { useCase } = harness({
      childRevisions: [revision('listing', 'listing-1')],
    });

    const result = await useCase.execute(TENANT_ID, GROUP_ID);

    expect(result.group).toBeNull();
    expect(result.listings).toHaveLength(1);
  });

  it('drops an item edit whose listing is no longer in the post', async () => {
    // A ghost row the reviewer could not act on.
    const { useCase } = harness({
      children: [child('listing-1')],
      childRevisions: [revision('listing', 'gone')],
    });

    expect((await useCase.execute(TENANT_ID, GROUP_ID)).listings).toEqual([]);
  });

  it('answers empty when nothing is waiting at all', async () => {
    const { useCase } = harness();

    await expect(useCase.execute(TENANT_ID, GROUP_ID)).resolves.toEqual({
      groupId: GROUP_ID,
      group: null,
      listings: [],
    });
  });
});
