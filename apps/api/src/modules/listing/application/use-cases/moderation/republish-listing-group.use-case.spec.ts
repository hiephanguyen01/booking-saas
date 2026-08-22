import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { RepublishListingGroupUseCase } from './republish-listing-group.use-case';

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
    useCase: new RepublishListingGroupUseCase(
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

describe('RepublishListingGroupUseCase', () => {
  it('refuses a partner re-publishing a post an ADMIN hid', async () => {
    const { useCase, groupUpdates } = harness({
      record: group({ status: 'archived', hiddenBy: 'admin', publishedBy: 'admin' }),
      children: [child({ status: 'archived' })],
    });

    await expect(useCase.execute(ctx, GROUP_ID, 'partner')).rejects.toThrow();
    expect(groupUpdates).toEqual([]);
  });

  it('lets an admin unlock and re-publish, items included', async () => {
    const { useCase, groupUpdates, childUpdates } = harness({
      record: group({ status: 'archived', hiddenBy: 'admin', publishedBy: 'admin' }),
      children: [child({ status: 'archived', publishedBy: 'admin' })],
    });

    await useCase.execute(ctx, GROUP_ID, 'admin');

    expect(groupUpdates[0]).toMatchObject({ status: 'published' });
    expect(childUpdates[0]).toMatchObject({ status: 'published' });
  });

  it('sends a never-published post AND its items back to review', async () => {
    // The children follow the post's OUTCOME, not the action name: un-hiding a
    // post that never passed review must queue its items up with it rather than
    // let them go live on their own.
    const { useCase, groupUpdates, childUpdates } = harness({
      record: group({ status: 'archived', hiddenBy: 'partner', publishedBy: null }),
      children: [child({ status: 'archived', publishedBy: null })],
    });

    await useCase.execute(ctx, GROUP_ID, 'partner');

    expect(groupUpdates[0]).toMatchObject({ status: 'pending_review' });
    expect(childUpdates[0]).toMatchObject({ status: 'pending_review' });
  });

  it('keeps an item in review when the POST is, even if that item was published before', async () => {
    // The branch that matters: this child WAS published once (publishedBy: 'admin'),
    // so its own republish transition would take it straight back to live. It must
    // follow the post's outcome instead — otherwise un-hiding a post that never
    // passed review would publish one of its items on its own.
    const { useCase, groupUpdates, childUpdates } = harness({
      record: group({ status: 'archived', hiddenBy: 'partner', publishedBy: null }),
      children: [child({ status: 'archived', publishedBy: 'admin' })],
    });

    await useCase.execute(ctx, GROUP_ID, 'partner');

    expect(groupUpdates[0]).toMatchObject({ status: 'pending_review' });
    expect(childUpdates[0]).toMatchObject({ status: 'pending_review' });
  });

  it('announces the post as published on the shared listing event', async () => {
    const { useCase, events } = harness({
      record: group({ status: 'archived', hiddenBy: 'partner', publishedBy: 'admin' }),
      children: [child({ status: 'archived', publishedBy: 'admin' })],
    });

    await useCase.execute(ctx, GROUP_ID, 'admin');

    expect(events).toEqual([
      { eventType: 'listing_group.published', payload: { groupId: GROUP_ID } },
    ]);
  });
});
