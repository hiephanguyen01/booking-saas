import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { ListingHasContactInfo } from '../../../domain/errors/listing-errors';
import {
  ListingRevisionAlreadyDecided,
  ListingRevisionNotFound,
} from '../../../domain/errors/listing-revision-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import type { ApplyListingGroupUpdateUseCase } from '../apply-listing-group-update.use-case';
import type { ApplyListingUpdateUseCase } from '../apply-listing-update.use-case';
import { ApproveListingRevisionUseCase } from './approve-listing-revision.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const GROUP_ID = 'group-1';

function listing(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: 'partner-1',
    groupId: null,
    status: 'published',
    title: 'Studio A',
    description: 'Phòng chụp rộng rãi, đủ ánh sáng tự nhiên.',
    photos: ['https://cdn.example/studio-a.jpg'],
    bookingModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    modeConfig: { hourly: { basePrice: '300000', granularity: 60, leadTimeMin: 0 } },
    effectiveCancellationPolicy: { id: 'policy-1', rules: [] },
    ...overrides,
  } as unknown as ListingRecord;
}

const revision = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'revision-1',
    tenantId: TENANT_ID,
    targetType: 'listing',
    targetId: LISTING_ID,
    status: 'pending',
    payload: { title: 'Studio A (mới)' },
    submittedAt: new Date('2026-08-01T00:00:00Z'),
    reviewedAt: null,
    reviewNote: null,
    appliedAt: null,
    ...overrides,
  }) as never;

interface Options {
  pending?: unknown;
  itemRevisions?: unknown[];
  record?: ListingRecord | null;
  decided?: unknown;
}

function harness(options: Options = {}) {
  const listingApplies: unknown[] = [];
  const groupApplies: unknown[] = [];
  const decisions: Array<{ expected: string; patch: Record<string, unknown> }> = [];
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
    useCase: new ApproveListingRevisionUseCase(
      fakePort<IListingRevisionRepository>({
        findPending: (_tx, targetType) =>
          Promise.resolve(
            (options.pending === undefined
              ? revision({ targetType, targetId: targetType === 'listing' ? LISTING_ID : GROUP_ID })
              : options.pending) as never,
          ),
        findPendingForTargets: () => Promise.resolve((options.itemRevisions ?? []) as never),
        decide: (_tx, _id, expected, patch) => {
          decisions.push({
            expected: expected as string,
            patch: patch as unknown as Record<string, unknown>,
          });
          return Promise.resolve(
            (options.decided === undefined ? revision() : options.decided) as never,
          );
        },
      }),
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(options.record === undefined ? listing() : options.record),
      }),
      fakeCollaborator<ApplyListingUpdateUseCase>({
        execute: (...args: unknown[]) => {
          listingApplies.push(args.slice(1));
          return Promise.resolve(listing());
        },
      }),
      fakeCollaborator<ApplyListingGroupUpdateUseCase>({
        execute: (...args: unknown[]) => {
          groupApplies.push(args.slice(1));
          return Promise.resolve({} as never);
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
    listingApplies,
    groupApplies,
    decisions,
    audits,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, actorUserId: 'staff-1', ip: '1.2.3.4' };

describe('ApproveListingRevisionUseCase', () => {
  it('reports when there is nothing waiting', async () => {
    const { useCase, listingApplies } = harness({ pending: null });

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingRevisionNotFound);
    expect(listingApplies).toEqual([]);
  });

  it('re-runs the contact-info gate on the MERGED content', async () => {
    // The gate that made the first publication safe applies to every later edit
    // too — otherwise a phone number slipped in by an edit would reach customers
    // the moment a reviewer approves.
    const { useCase, listingApplies } = harness({
      pending: revision({ payload: { description: 'Liên hệ 0901234567' } }),
    });

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingHasContactInfo);
    expect(listingApplies).toEqual([]);
  });

  it('lets a reviewer force past the gate', async () => {
    const { useCase, listingApplies } = harness({
      pending: revision({ payload: { description: 'Liên hệ 0901234567' } }),
    });

    await useCase.execute(ctx, LISTING_ID, true);

    expect(listingApplies).toHaveLength(1);
  });

  it('applies the payload, stamps appliedAt and announces it', async () => {
    const { useCase, tenantDb, listingApplies, decisions, audits, events } = harness();

    await useCase.execute(ctx, LISTING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(listingApplies[0]).toEqual([TENANT_ID, LISTING_ID, { title: 'Studio A (mới)' }]);
    expect(decisions[0]?.expected).toBe('pending');
    expect(decisions[0]?.patch).toMatchObject({ status: 'approved', reviewedByUserId: 'staff-1' });
    expect(decisions[0]?.patch.appliedAt).toBeInstanceOf(Date);
    expect(audits[0]).toMatchObject({
      action: 'listing.revision_approved',
      entityId: LISTING_ID,
      data: { revisionId: 'revision-1', fields: ['title'] },
    });
    expect(events).toEqual([
      {
        eventType: 'listing.revision_approved',
        payload: { listingId: LISTING_ID, revisionId: 'revision-1' },
      },
    ]);
  });

  it('fails when the revision was decided first', async () => {
    const { useCase, audits } = harness({ decided: null });

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(
      ListingRevisionAlreadyDecided,
    );
    expect(audits).toEqual([]);
  });

  it('approves a post and every waiting item in ONE transaction', async () => {
    // A post is reviewed as a unit: approving the post's own edit while leaving an
    // item's parked would publish half a reviewed change.
    const { useCase, tenantDb, listingApplies, groupApplies } = harness({
      itemRevisions: [
        revision({ id: 'revision-item-1', targetId: 'listing-1' }),
        revision({ id: 'revision-item-2', targetId: 'listing-2' }),
      ],
    });

    await useCase.executeForGroup(ctx, GROUP_ID, ['listing-1', 'listing-2']);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(groupApplies).toHaveLength(1);
    expect(listingApplies).toHaveLength(2);
  });

  it('approves the items even when the post itself has no waiting edit', async () => {
    const { useCase, groupApplies, listingApplies } = harness({
      pending: null,
      itemRevisions: [revision({ id: 'revision-item-1' })],
    });

    await useCase.executeForGroup(ctx, GROUP_ID, ['listing-1']);

    expect(groupApplies).toEqual([]);
    expect(listingApplies).toHaveLength(1);
  });

  it('reports when neither the post nor any item has anything waiting', async () => {
    const { useCase } = harness({ pending: null, itemRevisions: [] });

    await expect(useCase.executeForGroup(ctx, GROUP_ID, ['listing-1'])).rejects.toBeInstanceOf(
      ListingRevisionNotFound,
    );
  });

  it('uses the post-shaped event key for a post revision', async () => {
    const { useCase, events } = harness({ itemRevisions: [] });

    await useCase.executeForGroup(ctx, GROUP_ID, []);

    expect(events).toEqual([
      {
        eventType: 'listing_group.revision_approved',
        payload: { listingGroupId: GROUP_ID, revisionId: 'revision-1' },
      },
    ]);
  });
});
