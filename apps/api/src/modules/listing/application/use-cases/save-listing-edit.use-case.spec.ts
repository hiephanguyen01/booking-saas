import { describe, expect, it } from 'vitest';
import type { UpdateListingInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingNotFound, ListingNotOwned } from '../../domain/errors/listing-errors';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../domain/ports/listing-revision-repository.port';
import type { ApplyListingUpdateUseCase } from './apply-listing-update.use-case';
import { SaveListingEditUseCase } from './save-listing-edit.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

const listing = (overrides: Record<string, unknown> = {}): ListingRecord =>
  ({
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    status: 'published',
    title: 'Studio A',
    ...overrides,
  }) as unknown as ListingRecord;

function harness(record: ListingRecord | null) {
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
    useCase: new SaveListingEditUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(record) }),
      fakePort<IListingRevisionRepository>({
        upsertPending: (_tx, _tenantId, data) => {
          parked.push(data);
          return Promise.resolve({ id: 'revision-1' } as never);
        },
      }),
      fakeCollaborator<ApplyListingUpdateUseCase>({
        execute: (...args: unknown[]) => {
          applied.push(args.slice(1));
          return Promise.resolve(listing({ title: 'Studio A (mới)' }));
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
const input = { title: 'Studio A (mới)' } as UpdateListingInput;

describe('SaveListingEditUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, LISTING_ID, input, ctx)).rejects.toBeInstanceOf(
      ListingNotFound,
    );
  });

  it("refuses another partner's listing", async () => {
    const { useCase, applied, parked } = harness(listing({ partnerId: 'partner-2' }));

    await expect(useCase.execute(TENANT_ID, LISTING_ID, input, ctx)).rejects.toBeInstanceOf(
      ListingNotOwned,
    );
    expect(applied).toEqual([]);
    expect(parked).toEqual([]);
  });

  it('writes a DRAFT in place — there is no approved version to protect', async () => {
    const { useCase, tenantDb, applied, parked, events } = harness(listing({ status: 'draft' }));

    const result = await useCase.execute(TENANT_ID, LISTING_ID, input, ctx);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result.parkedForReview).toBe(false);
    expect(applied[0]).toEqual([
      TENANT_ID,
      LISTING_ID,
      input,
      { requirePartnerId: PARTNER_ID, modeConfigValidation: 'draft' },
    ]);
    expect(parked).toEqual([]);
    expect(events).toEqual([]);
  });

  it.each(['pending_review', 'published', 'archived'])(
    'parks the edit on a %s listing instead of touching the live row',
    async (status) => {
      // ADR 0007: the row only ever holds approved content, so editing no longer
      // takes a published listing offline.
      const { useCase, applied, parked } = harness(listing({ status }));

      const result = await useCase.execute(TENANT_ID, LISTING_ID, input, ctx);

      expect(result.parkedForReview).toBe(true);
      expect(result.listing).toMatchObject({ title: 'Studio A' });
      expect(applied).toEqual([]);
      expect(parked).toEqual([
        {
          targetType: 'listing',
          targetId: LISTING_ID,
          payload: input,
          submittedByUserId: 'user-1',
        },
      ]);
    },
  );

  it('parks by UPSERT, so saving again overwrites rather than queueing twice', async () => {
    // Parking IS the submission — there is no separate submit step, and a second
    // save must not put two cards in the reviewer's queue.
    const { useCase, parked, events } = harness(listing());

    await useCase.execute(TENANT_ID, LISTING_ID, input, ctx);
    await useCase.execute(TENANT_ID, LISTING_ID, input, ctx);

    expect(parked).toHaveLength(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      eventType: 'listing.revision_submitted',
      payload: { listingId: LISTING_ID, revisionId: 'revision-1' },
    });
  });

  it('treats an EMPTY patch as a no-op rather than parking it', async () => {
    // An empty card in the reviewer's queue would block re-publishing for nothing.
    const { useCase, parked, events } = harness(listing());

    const result = await useCase.execute(TENANT_ID, LISTING_ID, {} as UpdateListingInput, ctx);

    expect(result.parkedForReview).toBe(false);
    expect(parked).toEqual([]);
    expect(events).toEqual([]);
  });
});
