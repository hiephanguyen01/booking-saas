import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound, ListingNotOwned } from '../../../domain/errors/listing-errors';
import { ListingGroupNotFound } from '../../../domain/errors/listing-group-errors';
import {
  ListingRevisionAlreadyDecided,
  ListingRevisionNotFound,
} from '../../../domain/errors/listing-revision-errors';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { DiscardListingRevisionUseCase } from './discard-listing-revision.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';
const REVISION_ID = 'revision-1';

function listing(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    title: 'Studio A',
    description: 'Phòng chụp rộng rãi.',
    ...overrides,
  } as unknown as ListingRecord;
}

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
  record?: ListingRecord | null;
  group?: ListingGroupRecord | null;
  pending?: unknown;
  decided?: unknown;
}

function harness(options: Options = {}) {
  const decisions: Array<{ expected: string; patch: Record<string, unknown> }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DiscardListingRevisionUseCase(
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
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(options.record === undefined ? listing() : options.record),
      }),
      fakePort<IListingGroupRepository>({
        findById: () =>
          Promise.resolve(
            options.group === undefined
              ? ({ id: 'group-1', partnerId: PARTNER_ID } as unknown as ListingGroupRecord)
              : options.group,
          ),
      }),
      tenantDb.service,
    ),
    tenantDb,
    decisions,
  };
}

const ctx = { partnerId: PARTNER_ID, actorUserId: 'user-1' };

describe('DiscardListingRevisionUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, decisions } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, 'listing', LISTING_ID, ctx)).rejects.toBeInstanceOf(
      ListingNotFound,
    );
    expect(decisions).toEqual([]);
  });

  it('checks ownership against the TARGET, not the revision', async () => {
    // The revision row carries no partner of its own; reading ownership from it
    // would let a partner discard a neighbour's parked edit.
    const { useCase, decisions } = harness({ record: listing({ partnerId: 'partner-2' }) });

    await expect(useCase.execute(TENANT_ID, 'listing', LISTING_ID, ctx)).rejects.toBeInstanceOf(
      ListingNotOwned,
    );
    expect(decisions).toEqual([]);
  });

  it('answers not-found for a post this tenant does not have', async () => {
    const { useCase } = harness({ group: null });

    await expect(
      useCase.execute(TENANT_ID, 'listing_group', 'group-1', ctx),
    ).rejects.toBeInstanceOf(ListingGroupNotFound);
  });

  it('reports when there is nothing waiting to discard', async () => {
    const { useCase } = harness({ pending: null });

    await expect(useCase.execute(TENANT_ID, 'listing', LISTING_ID, ctx)).rejects.toBeInstanceOf(
      ListingRevisionNotFound,
    );
  });

  it('discards with a compare-and-set on pending, leaving no review note', async () => {
    // Discarding is the partner withdrawing their own edit — not a decision, so
    // there is nothing to tell them and nothing was applied.
    const { useCase, tenantDb, decisions } = harness();

    await useCase.execute(TENANT_ID, 'listing', LISTING_ID, ctx);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(decisions).toEqual([
      {
        expected: 'pending',
        patch: {
          status: 'discarded',
          reviewedByUserId: 'user-1',
          reviewNote: null,
          appliedAt: null,
        },
      },
    ]);
  });

  it('fails when a reviewer decided it first', async () => {
    const { useCase } = harness({ decided: null });

    await expect(useCase.execute(TENANT_ID, 'listing', LISTING_ID, ctx)).rejects.toBeInstanceOf(
      ListingRevisionAlreadyDecided,
    );
  });
});
