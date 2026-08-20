import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  ListingRevisionAlreadyDecided,
  ListingRevisionNotFound,
} from '../../../domain/errors/listing-revision-errors';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { RejectListingRevisionUseCase } from './reject-listing-revision.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const REVISION_ID = 'revision-1';

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: REVISION_ID,
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
  } as never;
}

interface Options {
  pending?: unknown;
  decided?: unknown;
}

function harness(options: Options = {}) {
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
    useCase: new RejectListingRevisionUseCase(
      fakePort<IListingRevisionRepository>({
        findPending: () =>
          Promise.resolve((options.pending === undefined ? revision() : options.pending) as never),
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
    decisions,
    audits,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, actorUserId: 'staff-1', ip: '1.2.3.4' };

describe('RejectListingRevisionUseCase', () => {
  it('reports when there is nothing waiting to reject', async () => {
    const { useCase, decisions } = harness({ pending: null });

    await expect(
      useCase.execute(ctx, 'listing', LISTING_ID, 'Bỏ số điện thoại'),
    ).rejects.toBeInstanceOf(ListingRevisionNotFound);
    expect(decisions).toEqual([]);
  });

  it('records the note and applies NOTHING to the live listing', async () => {
    // The listing keeps serving its approved content; the partner still has their
    // edit in the form and can fix and resubmit it.
    const { useCase, tenantDb, decisions } = harness();

    await useCase.execute(ctx, 'listing', LISTING_ID, 'Bỏ số điện thoại');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(decisions).toEqual([
      {
        expected: 'pending',
        patch: {
          status: 'rejected',
          reviewedByUserId: 'staff-1',
          reviewNote: 'Bỏ số điện thoại',
          appliedAt: null,
        },
      },
    ]);
  });

  it('fails when the revision was already decided', async () => {
    const { useCase, audits } = harness({ decided: null });

    await expect(
      useCase.execute(ctx, 'listing', LISTING_ID, 'Bỏ số điện thoại'),
    ).rejects.toBeInstanceOf(ListingRevisionAlreadyDecided);
    expect(audits).toEqual([]);
  });

  it("carries the reviewer's note into the event the partner's email reads", async () => {
    const { useCase, audits, events } = harness();

    await useCase.execute(ctx, 'listing', LISTING_ID, 'Bỏ số điện thoại');

    expect(audits[0]).toMatchObject({
      action: 'listing.revision_rejected',
      entityType: 'listing',
      entityId: LISTING_ID,
      data: { revisionId: REVISION_ID, note: 'Bỏ số điện thoại' },
    });
    expect(events).toEqual([
      {
        eventType: 'listing.revision_rejected',
        payload: { listingId: LISTING_ID, revisionId: REVISION_ID, reason: 'Bỏ số điện thoại' },
      },
    ]);
  });

  it('uses the post-shaped event and key for a post revision', async () => {
    // The notification dispatcher reads `listingId` for one and `listingGroupId`
    // for the other; sending the wrong key silently drops the partner's email.
    const { useCase, audits, events } = harness({
      pending: revision({ targetType: 'listing_group', targetId: 'group-1' }),
    });

    await useCase.execute(ctx, 'listing_group', 'group-1', 'Bỏ số điện thoại');

    expect(audits[0]).toMatchObject({ entityType: 'listing_group', entityId: 'group-1' });
    expect(events).toEqual([
      {
        eventType: 'listing_group.revision_rejected',
        payload: {
          listingGroupId: 'group-1',
          revisionId: REVISION_ID,
          reason: 'Bỏ số điện thoại',
        },
      },
    ]);
  });
});
