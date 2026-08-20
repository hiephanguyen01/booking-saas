import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  ListingNotOwnedForModeration,
  ListingStateChanged,
} from '../../../domain/errors/listing-errors';
import {
  ListingGroupEmpty,
  ListingGroupNotFound,
} from '../../../domain/errors/listing-group-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { SubmitListingGroupUseCase } from './submit-listing-group.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';
const PARTNER_ID = 'partner-1';

function group(overrides: Record<string, unknown> = {}): ListingGroupRecord {
  return {
    id: GROUP_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    status: 'draft',
    title: 'Khách sạn A',
    description: 'Khách sạn ven biển, phòng rộng.',
    photos: ['https://cdn.example/hotel.jpg'],
    publishedBy: null,
    hiddenBy: null,
    publishedAt: null,
    ...overrides,
  } as unknown as ListingGroupRecord;
}

function child(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: 'listing-1',
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    groupId: GROUP_ID,
    status: 'draft',
    title: 'Phòng Deluxe',
    description: 'Phòng hướng biển, có ban công.',
    photos: ['https://cdn.example/room.jpg'],
    bookingModes: ['daily'],
    bookingSelection: 'flexible_duration',
    modeConfig: { daily: { basePricePerNight: '900000', leadTimeMin: 0 } },
    effectiveCancellationPolicy: { id: 'policy-1', rules: [] },
    publishedBy: null,
    hiddenBy: null,
    publishedAt: null,
    ...overrides,
  } as unknown as ListingRecord;
}

const ctx = { tenantId: TENANT_ID, actorUserId: 'staff-1', ip: '1.2.3.4' };

interface Options {
  record?: ListingGroupRecord | null;
  children?: ListingRecord[];
  moderated?: ListingGroupRecord | null;
  childModerated?: ListingRecord | null;
}

function harness(options: Options = {}) {
  const groupUpdates: Array<Record<string, unknown>> = [];
  const childUpdates: Array<Record<string, unknown>> = [];
  const audits: AuditEntry[] = [];
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
    useCase: new SubmitListingGroupUseCase(
      fakePort<IListingGroupRepository>({
        findById: () => Promise.resolve(options.record === undefined ? group() : options.record),
        moderate: (_tx, _id, _expected, update) => {
          groupUpdates.push(update as unknown as Record<string, unknown>);
          return Promise.resolve(
            options.moderated === undefined
              ? ({ ...group(), ...(update as object) } as ListingGroupRecord)
              : options.moderated,
          );
        },
      }),
      fakePort<IListingRepository>({
        list: () => Promise.resolve(options.children ?? [child()]),
        moderate: (_tx, _id, _expected, update) => {
          childUpdates.push(update as unknown as Record<string, unknown>);
          return Promise.resolve(
            options.childModerated === undefined
              ? ({ ...child(), ...(update as object) } as ListingRecord)
              : options.childModerated,
          );
        },
      }),
      tenantDb.service,
      new OutboxService(),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
    ),
    tenantDb,
    groupUpdates,
    childUpdates,
    audits,
    events,
  };
}

describe('SubmitListingGroupUseCase', () => {
  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase, groupUpdates } = harness({ record: null });

    await expect(useCase.execute(ctx, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupNotFound);
    expect(groupUpdates).toEqual([]);
  });

  it("refuses another partner's post on a partner-scoped call", async () => {
    // Posts reuse the LISTING moderation-ownership error on purpose: the two paths
    // answer identically so a partner cannot tell a post from a listing by the code.
    const { useCase } = harness({ record: group({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute({ ...ctx, partnerId: PARTNER_ID }, GROUP_ID),
    ).rejects.toBeInstanceOf(ListingNotOwnedForModeration);
  });

  it('refuses to submit a post with no items', async () => {
    // A reviewer would be asked to approve a post that publishes nothing.
    const { useCase, groupUpdates } = harness({ children: [] });

    await expect(useCase.execute(ctx, GROUP_ID)).rejects.toBeInstanceOf(ListingGroupEmpty);
    expect(groupUpdates).toEqual([]);
  });

  it('queues the post AND every item it would publish', async () => {
    // The items are moderated through the post, so they must move with it —
    // otherwise approving the post would publish items still sitting in draft.
    const { useCase, tenantDb, groupUpdates, childUpdates, events } = harness({
      children: [child(), child({ id: 'listing-2' })],
    });

    await useCase.execute(ctx, GROUP_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(groupUpdates[0]).toMatchObject({ status: 'pending_review' });
    expect(childUpdates).toHaveLength(2);
    expect(childUpdates[0]).toMatchObject({ status: 'pending_review' });
    expect(events).toEqual([
      { eventType: 'listing_group.submitted', payload: { groupId: GROUP_ID } },
    ]);
  });

  it('fails the whole submission when a child write matched no row', async () => {
    // One transaction: a post half-submitted would leave items a reviewer cannot
    // see behind a post they can.
    const { useCase } = harness({ childModerated: null });

    await expect(useCase.execute(ctx, GROUP_ID)).rejects.toBeInstanceOf(ListingStateChanged);
  });
});
