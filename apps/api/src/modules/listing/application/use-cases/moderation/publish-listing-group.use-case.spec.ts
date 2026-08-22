import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { ListingStateChanged } from '../../../domain/errors/listing-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { ListingHasContactInfo } from '../../../domain/errors/listing-errors';
import { PublishListingGroupUseCase } from './publish-listing-group.use-case';

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
    useCase: new PublishListingGroupUseCase(
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

describe('PublishListingGroupUseCase', () => {
  it('publishes the post and every item with it', async () => {
    const { useCase, tenantDb, groupUpdates, childUpdates, events } = harness({
      record: group({ status: 'pending_review' }),
      children: [child({ status: 'pending_review' })],
    });

    await useCase.execute(ctx, GROUP_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(groupUpdates[0]).toMatchObject({ status: 'published', publishedBy: 'admin' });
    expect(childUpdates[0]).toMatchObject({ status: 'published', publishedBy: 'admin' });
    expect(events).toEqual([
      { eventType: 'listing_group.published', payload: { groupId: GROUP_ID } },
    ]);
  });

  it("scans the ITEMS' text as well as the post's own", async () => {
    // Publishing a post publishes every child with it. Scanning only the post
    // would let a partner smuggle a phone number into an item description and
    // have it published, bypassing the gate the per-listing path enforces.
    const { useCase, groupUpdates } = harness({
      record: group({ status: 'pending_review' }),
      children: [child({ status: 'pending_review', description: 'Liên hệ 0901234567' })],
    });

    await expect(useCase.execute(ctx, GROUP_ID)).rejects.toBeInstanceOf(ListingHasContactInfo);
    expect(groupUpdates).toEqual([]);
  });

  it("scans the post's own text too", async () => {
    const { useCase } = harness({
      record: group({ status: 'pending_review', description: 'Gọi 0901234567 để đặt' }),
      children: [child({ status: 'pending_review' })],
    });

    await expect(useCase.execute(ctx, GROUP_ID)).rejects.toBeInstanceOf(ListingHasContactInfo);
  });

  it('lets a reviewer force past the gate, recorded in the audit', async () => {
    const { useCase, groupUpdates, audits } = harness({
      record: group({ status: 'pending_review' }),
      children: [child({ status: 'pending_review', description: 'Liên hệ 0901234567' })],
    });

    await useCase.execute(ctx, GROUP_ID, true);

    expect(groupUpdates).toHaveLength(1);
    expect(audits[0]?.data).toMatchObject({
      reason: 'force-published: contact-info gate bypassed',
    });
  });

  it('fails when the guarded post write matched no row', async () => {
    const { useCase } = harness({
      record: group({ status: 'pending_review' }),
      children: [child({ status: 'pending_review' })],
      moderated: null,
    });

    await expect(useCase.execute(ctx, GROUP_ID)).rejects.toBeInstanceOf(ListingStateChanged);
  });
});
