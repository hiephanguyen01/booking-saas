import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { ListingNotFound, ListingStateChanged } from '../../../domain/errors/listing-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { RepublishListingUseCase } from './republish-listing.use-case';

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
    useCase: new RepublishListingUseCase(
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

describe('RepublishListingUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, LISTING_ID, 'partner')).rejects.toBeInstanceOf(
      ListingNotFound,
    );
  });

  it('refuses a partner re-publishing a listing an ADMIN hid', async () => {
    // 403 LISTING_ADMIN_LOCKED — only an admin can unlock (§7.3).
    const { useCase, updates } = harness(
      listing({ status: 'archived', hiddenBy: 'admin', publishedBy: 'admin' }),
    );

    await expect(useCase.execute(ctx, LISTING_ID, 'partner')).rejects.toThrow();
    expect(updates).toEqual([]);
  });

  it('lets an admin unlock and re-publish', async () => {
    const { useCase, updates } = harness(
      listing({ status: 'archived', hiddenBy: 'admin', publishedBy: 'admin' }),
    );

    await useCase.execute(ctx, LISTING_ID, 'admin');

    expect(updates[0]?.update).toMatchObject({ status: 'published' });
  });

  it('sends a never-published listing back to REVIEW, not live', async () => {
    // Hidden while still awaiting its first review, so its content was never
    // approved; un-hiding it must not put it in front of customers.
    const { useCase, updates, events } = harness(
      listing({ status: 'archived', hiddenBy: 'partner', publishedBy: null }),
    );

    await useCase.execute(ctx, LISTING_ID, 'partner');

    expect(updates[0]?.update).toMatchObject({ status: 'pending_review' });
    expect(updates[0]?.update.submittedAt).toBeInstanceOf(Date);
    expect(events).toEqual([
      { eventType: 'listing.published', payload: { listingId: LISTING_ID } },
    ]);
  });

  it('keeps the ORIGINAL publishedAt on a re-publish', async () => {
    const { useCase, updates } = harness(
      listing({
        status: 'archived',
        hiddenBy: 'partner',
        publishedBy: 'admin',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );

    await useCase.execute(ctx, LISTING_ID, 'partner');

    expect(updates[0]?.update.publishedAt).toBeUndefined();
  });

  it('refuses to re-publish a listing that is not archived', async () => {
    const { useCase } = harness(listing({ status: 'published' }));

    await expect(useCase.execute(ctx, LISTING_ID, 'admin')).rejects.toThrow();
  });

  it('fails when the guarded moderation write matched no row', async () => {
    const { useCase } = harness(
      listing({ status: 'archived', hiddenBy: 'partner', publishedBy: 'admin' }),
      null,
    );

    await expect(useCase.execute(ctx, LISTING_ID, 'admin')).rejects.toBeInstanceOf(
      ListingStateChanged,
    );
  });
});
