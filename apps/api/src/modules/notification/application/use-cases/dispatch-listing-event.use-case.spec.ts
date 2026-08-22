import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type {
  INotificationReader,
  ListingNotificationContext,
} from '../../domain/ports/notification-reader.port';
import { DispatchListingEventUseCase } from './dispatch-listing-event.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const STAFF = { userId: 'user-partner', email: 'giang@giangstudio.vn', name: 'Giang', locale: 'vi' };

const context = (overrides: Record<string, unknown> = {}): ListingNotificationContext =>
  ({
    listingTitle: 'Sân bóng số 1',
    tenantName: 'StudioHub',
    brand: { dashboardUrl: 'https://admin.studiohub.vn' },
    partnerRecipients: [STAFF],
    ...overrides,
  }) as unknown as ListingNotificationContext;

function harness(ctx: ListingNotificationContext | null = context()) {
  const sent: Array<{ to: string }> = [];
  const rendered: Array<{ templateId: string; data: Record<string, unknown> }> = [];
  const dedupeKeys: string[] = [];
  const inboxWrites: unknown[][] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchListingEventUseCase(
      fakePort<INotificationReader>({ loadListingContext: () => Promise.resolve(ctx) }),
      fakePort<IEmailSender>({
        send: (m) => {
          sent.push(m as unknown as { to: string });
          return Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (templateId, _locale, _brand, data) => {
          rendered.push({ templateId, data: data as unknown as Record<string, unknown> });
          return Promise.resolve({ subject: 's', text: 't', html: '<p>t</p>' });
        },
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (k) => {
          dedupeKeys.push(k);
          return Promise.resolve(false);
        },
        record: () => Promise.resolve(),
      }),
      fakePort<INotificationInboxRepository>({
        insertMany: (_tx, rows) => {
          inboxWrites.push(rows as unknown[]);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    sent,
    rendered,
    dedupeKeys,
    inboxWrites,
  };
}

describe('DispatchListingEventUseCase', () => {
  it('does nothing for an event with no plan, without reading the listing', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'listing.created', { listingId: LISTING_ID });

    expect(tenantDb.openedFor).toEqual([]);
  });

  it('sends nothing for a listing that no longer exists', async () => {
    const { useCase, sent } = harness(null);

    await useCase.execute(TENANT_ID, 'listing.revision_rejected', { listingId: LISTING_ID });

    expect(sent).toEqual([]);
  });

  it('CARRIES the rejection reason into the email', async () => {
    // Without it the partner is told their listing was rejected and nothing
    // else, which is the whole point of the message.
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, 'listing.revision_rejected', {
      listingId: LISTING_ID,
      reason: 'Ảnh không rõ mặt sân',
    });

    expect(rendered[0]?.data).toMatchObject({
      listingTitle: 'Sân bóng số 1',
      reason: 'Ảnh không rõ mặt sân',
      ctaUrl: 'https://admin.studiohub.vn/partner/listings',
    });
  });

  it('reaches every partner recipient and dedupes per recipient', async () => {
    const { useCase, sent, dedupeKeys } = harness(
      context({ partnerRecipients: [STAFF, { ...STAFF, userId: 'u2', email: 'b@x.vn' }] }),
    );

    await useCase.execute(TENANT_ID, 'listing.published', { listingId: LISTING_ID });

    expect(sent.map((s) => s.to)).toEqual([STAFF.email, 'b@x.vn']);
    expect(dedupeKeys).toHaveLength(2);
    expect(dedupeKeys[0]).toContain(LISTING_ID);
  });

  it('writes the bell rows in one batch after the sends', async () => {
    const { useCase, inboxWrites, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'listing.published', { listingId: LISTING_ID });

    expect(inboxWrites).toHaveLength(1);
    expect(tenantDb.openedFor).toEqual([TENANT_ID, TENANT_ID]);
  });
});
