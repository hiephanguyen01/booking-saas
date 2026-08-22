import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  GroupManagedListing,
  ListingNotFound,
  ListingNotOwnedForModeration,
  ListingStateChanged,
} from '../../../domain/errors/listing-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { SubmitListingUseCase } from './submit-listing.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';

/** A listing whose review passes cleanly: photos, description, price, policy. */
function listing(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    groupId: null,
    status: 'draft',
    title: 'Studio A',
    description: 'Phòng chụp rộng rãi, đủ ánh sáng tự nhiên.',
    photos: ['https://cdn.example/studio-a.jpg'],
    bookingModes: ['hourly'],
    bookingSelection: 'flexible_duration',
    modeConfig: { hourly: { basePrice: '300000', granularity: 60, leadTimeMin: 0 } },
    effectiveCancellationPolicy: { id: 'policy-1', rules: [] },
    publishedBy: null,
    hiddenBy: null,
    publishedAt: null,
    ...overrides,
  } as unknown as ListingRecord;
}

const ctx = { tenantId: TENANT_ID, actorUserId: 'staff-1', ip: '1.2.3.4' };

function harness(
  record: ListingRecord | null,
  moderated: ListingRecord | null | undefined = undefined,
) {
  const updates: Array<{ expectedStatus: string; update: Record<string, unknown> }> = [];
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
    useCase: new SubmitListingUseCase(
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(record),
        moderate: (_tx, _id, expectedStatus, update) => {
          updates.push({
            expectedStatus: expectedStatus as string,
            update: update as unknown as Record<string, unknown>,
          });
          return Promise.resolve(
            moderated === undefined
              ? ({ ...listing(), ...(update as object) } as ListingRecord)
              : moderated,
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
    updates,
    audits,
    events,
  };
}

describe('SubmitListingUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase, updates } = harness(null);

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingNotFound);
    expect(updates).toEqual([]);
  });

  it("refuses another partner's listing on a partner-scoped call", async () => {
    const { useCase, updates } = harness(listing({ partnerId: 'partner-2' }));

    await expect(
      useCase.execute({ ...ctx, partnerId: PARTNER_ID }, LISTING_ID),
    ).rejects.toBeInstanceOf(ListingNotOwnedForModeration);
    expect(updates).toEqual([]);
  });

  it('refuses a listing bound to a post — the parent is moderated instead', async () => {
    const { useCase } = harness(listing({ groupId: 'group-1' }));

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(GroupManagedListing);
  });

  it('refuses to resubmit a listing an ADMIN hid', async () => {
    // The lockout is the load-bearing rule of §7.3: only an admin can unlock.
    const { useCase } = harness(listing({ status: 'archived', hiddenBy: 'admin' }));

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toThrow();
  });

  it('lets a partner resubmit a listing THEY hid', async () => {
    const { useCase, updates } = harness(listing({ status: 'archived', hiddenBy: 'partner' }));

    await useCase.execute(ctx, LISTING_ID);

    expect(updates[0]?.update).toMatchObject({ status: 'pending_review' });
  });

  it('stamps the wait clock on every entry into review, and returns the review', async () => {
    // `submittedAt` resets on a resubmission on purpose: the queue shows how long
    // THIS submission has been waiting, not the first one.
    const { useCase, tenantDb, updates, audits, events } = harness(listing());

    const result = await useCase.execute(ctx, LISTING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(updates[0]?.expectedStatus).toBe('draft');
    expect(updates[0]?.update.submittedAt).toBeInstanceOf(Date);
    expect(updates[0]?.update.publishedAt).toBeUndefined();
    expect(audits[0]).toMatchObject({
      action: 'listing.submitted',
      entityId: LISTING_ID,
      data: { fromStatus: 'draft', toStatus: 'pending_review' },
    });
    expect(events).toEqual([
      { eventType: 'listing.submitted', payload: { listingId: LISTING_ID } },
    ]);
    expect(result.review).toMatchObject({ listingId: LISTING_ID, checklistPassed: true });
  });

  it('fails when the guarded moderation write matched no row', async () => {
    // Someone else moved the listing between the read and the write.
    const { useCase, audits } = harness(listing(), null);

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingStateChanged);
    expect(audits).toEqual([]);
  });
});
