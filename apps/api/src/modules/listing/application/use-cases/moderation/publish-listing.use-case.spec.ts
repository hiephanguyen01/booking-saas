import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  GroupManagedListing,
  ListingNotFound,
  ListingStateChanged,
} from '../../../domain/errors/listing-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { ListingHasContactInfo } from '../../../domain/errors/listing-errors';
import { PublishListingUseCase } from './publish-listing.use-case';

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
    useCase: new PublishListingUseCase(
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

describe('PublishListingUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingNotFound);
  });

  it('refuses a listing bound to a post', async () => {
    const { useCase } = harness(listing({ status: 'pending_review', groupId: 'group-1' }));

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(GroupManagedListing);
  });

  it('refuses to publish a listing that leaks contact information', async () => {
    // §7.3: the reviewer must have the partner remove it first — publishing it
    // would put a phone number in front of customers and route bookings off-platform.
    const { useCase, updates } = harness(
      listing({ status: 'pending_review', description: 'Liên hệ 0901234567 để đặt' }),
    );

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingHasContactInfo);
    expect(updates).toEqual([]);
  });

  it('lets a reviewer force past the gate, and records that in the audit', async () => {
    const { useCase, updates, audits } = harness(
      listing({ status: 'pending_review', description: 'Liên hệ 0901234567 để đặt' }),
    );

    await useCase.execute(ctx, LISTING_ID, true);

    expect(updates).toHaveLength(1);
    expect(audits[0]?.data).toMatchObject({
      reason: 'force-published: review gate bypassed',
    });
  });

  it('records no override reason when there was nothing to override', async () => {
    const { useCase, audits } = harness(listing({ status: 'pending_review' }));

    await useCase.execute(ctx, LISTING_ID, true);

    expect(audits[0]?.data).toMatchObject({ reason: null });
  });

  it('publishes as the ADMIN actor and clears any prior hide', async () => {
    const { useCase, tenantDb, updates, events } = harness(
      listing({ status: 'pending_review', hiddenBy: 'partner' }),
    );

    await useCase.execute(ctx, LISTING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(updates[0]?.update).toMatchObject({
      status: 'published',
      publishedBy: 'admin',
      hiddenBy: null,
    });
    expect(events).toEqual([
      { eventType: 'listing.published', payload: { listingId: LISTING_ID } },
    ]);
  });

  it('stamps publishedAt only the FIRST time', async () => {
    // The column means "first published" and must survive a later hide, so a
    // republish must not overwrite it.
    const first = harness(listing({ status: 'pending_review', publishedAt: null }));
    await first.useCase.execute(ctx, LISTING_ID);
    expect(first.updates[0]?.update.publishedAt).toBeInstanceOf(Date);

    const again = harness(
      listing({ status: 'pending_review', publishedAt: new Date('2026-01-01T00:00:00Z') }),
    );
    await again.useCase.execute(ctx, LISTING_ID);
    expect(again.updates[0]?.update.publishedAt).toBeUndefined();
  });

  it('refuses to publish a listing that is not in review', async () => {
    const { useCase } = harness(listing({ status: 'draft' }));

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toThrow();
  });

  it('fails when the guarded moderation write matched no row', async () => {
    const { useCase } = harness(listing({ status: 'pending_review' }), null);

    await expect(useCase.execute(ctx, LISTING_ID)).rejects.toBeInstanceOf(ListingStateChanged);
  });
});
