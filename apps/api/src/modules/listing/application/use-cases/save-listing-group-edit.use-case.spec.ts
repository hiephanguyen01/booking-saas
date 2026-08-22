import { describe, expect, it } from 'vitest';
import type { UpdateListingGroupInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingGroupNotFound } from '../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRevisionRepository } from '../../domain/ports/listing-revision-repository.port';
import type { ApplyListingGroupUpdateUseCase } from './apply-listing-group-update.use-case';
import { SaveListingGroupEditUseCase } from './save-listing-group-edit.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

const group = (overrides: Record<string, unknown> = {}): ListingGroupRecord =>
  ({
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    status: 'published',
    title: 'Khách sạn A',
    ...overrides,
  }) as unknown as ListingGroupRecord;

function harness(record: ListingGroupRecord | null) {
  const applied: unknown[] = [];
  const parked: unknown[] = [];
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
    useCase: new SaveListingGroupEditUseCase(
      fakePort<IListingGroupRepository>({ findById: () => Promise.resolve(record) }),
      fakePort<IListingRevisionRepository>({
        upsertPending: (_tx, _tenantId, data) => {
          parked.push(data);
          return Promise.resolve({ id: 'revision-1' } as never);
        },
      }),
      fakeCollaborator<ApplyListingGroupUpdateUseCase>({
        execute: (...args: unknown[]) => {
          applied.push(args.slice(1));
          return Promise.resolve(group({ title: 'Khách sạn A (mới)' }));
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    applied,
    parked,
    events,
  };
}

const ctx = { partnerId: PARTNER_ID, actorUserId: 'user-1' };
const input = { title: 'Khách sạn A (mới)' } as UpdateListingGroupInput;

describe('SaveListingGroupEditUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, GROUP_ID, input, ctx)).rejects.toBeInstanceOf(
      ListingGroupNotFound,
    );
  });

  it("refuses another partner's post", async () => {
    const { useCase, parked } = harness(group({ partnerId: 'partner-2' }));

    await expect(useCase.execute(TENANT_ID, GROUP_ID, input, ctx)).rejects.toThrow();
    expect(parked).toEqual([]);
  });

  it('writes a DRAFT post in place', async () => {
    const { useCase, tenantDb, applied, parked } = harness(group({ status: 'draft' }));

    const result = await useCase.execute(TENANT_ID, GROUP_ID, input, ctx);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result.parkedForReview).toBe(false);
    expect(applied[0]).toEqual([TENANT_ID, GROUP_ID, input, { requirePartnerId: PARTNER_ID }]);
    expect(parked).toEqual([]);
  });

  it('keeps a reviewed post LIVE while its edit waits', async () => {
    // This is what replaced the old hide-edit-resubmit cycle: the post stays
    // visible and bookable the whole time.
    const { useCase, parked, events } = harness(group());

    const result = await useCase.execute(TENANT_ID, GROUP_ID, input, ctx);

    expect(result.parkedForReview).toBe(true);
    expect(result.group).toMatchObject({ status: 'published', title: 'Khách sạn A' });
    expect(parked).toEqual([
      {
        targetType: 'listing_group',
        targetId: GROUP_ID,
        payload: input,
        submittedByUserId: 'user-1',
      },
    ]);
    expect(events).toEqual([
      {
        eventType: 'listing_group.revision_submitted',
        payload: { listingGroupId: GROUP_ID, revisionId: 'revision-1' },
      },
    ]);
  });

  it('treats an EMPTY patch as a no-op', async () => {
    const { useCase, parked, events } = harness(group());

    const result = await useCase.execute(TENANT_ID, GROUP_ID, {} as UpdateListingGroupInput, ctx);

    expect(result.parkedForReview).toBe(false);
    expect(parked).toEqual([]);
    expect(events).toEqual([]);
  });
});
