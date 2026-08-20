import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import {
  ListingNotFound,
  ListingNotOwnedForModeration,
} from '../../../domain/errors/listing-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { HideListingUseCase } from './hide-listing.use-case';

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
    useCase: new HideListingUseCase(
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

describe('HideListingUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, LISTING_ID, 'admin')).rejects.toBeInstanceOf(ListingNotFound);
  });

  it("refuses another partner's listing on a partner-scoped call", async () => {
    const { useCase } = harness(listing({ status: 'published', partnerId: 'partner-2' }));

    await expect(
      useCase.execute({ ...ctx, partnerId: PARTNER_ID }, LISTING_ID, 'partner'),
    ).rejects.toBeInstanceOf(ListingNotOwnedForModeration);
  });

  it('records WHO hid it, because that decides who can un-hide', async () => {
    const { useCase, tenantDb, updates, events } = harness(listing({ status: 'published' }));

    await useCase.execute(ctx, LISTING_ID, 'admin', 'vi phạm nội dung');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(updates[0]?.update).toMatchObject({ status: 'archived', hiddenBy: 'admin' });
    expect(events).toEqual([
      { eventType: 'listing.hidden', payload: { listingId: LISTING_ID, hiddenBy: 'admin' } },
    ]);
  });

  it('keeps an ADMIN lock even when a partner hides it afterwards', async () => {
    // Otherwise a partner could launder an admin lock away by hiding the listing
    // themselves and re-publishing it.
    const { useCase, updates } = harness(listing({ status: 'published', hiddenBy: 'admin' }));

    await useCase.execute(ctx, LISTING_ID, 'partner');

    expect(updates[0]?.update).toMatchObject({ hiddenBy: 'admin' });
  });

  it('stamps no timestamps — hiding is not a milestone', async () => {
    const { useCase, updates } = harness(listing({ status: 'published' }));

    await useCase.execute(ctx, LISTING_ID, 'partner');

    expect(updates[0]?.update).not.toHaveProperty('submittedAt');
    expect(updates[0]?.update).not.toHaveProperty('publishedAt');
  });

  it('carries the reason into the audit trail', async () => {
    const { useCase, audits } = harness(listing({ status: 'published' }));

    await useCase.execute(ctx, LISTING_ID, 'admin', 'vi phạm nội dung');

    expect(audits[0]).toMatchObject({
      action: 'listing.hidden',
      data: { fromStatus: 'published', toStatus: 'archived', reason: 'vi phạm nội dung' },
    });
  });

  it.each(['draft', 'archived'])('refuses to hide a %s listing', async (status) => {
    const { useCase } = harness(listing({ status }));

    await expect(useCase.execute(ctx, LISTING_ID, 'admin')).rejects.toThrow();
  });
});
