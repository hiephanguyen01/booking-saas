import { describe, expect, it } from 'vitest';
import type { CreateReviewInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import type { EligibleBooking, NewReview } from '../../domain/entities/review.entity';
import {
  InvalidReviewMedia,
  ReviewBookingNotEligible,
} from '../../domain/errors/review-errors';
import type {
  IReviewRepository,
  ReviewRecord,
} from '../../domain/ports/review-repository.port';
import type { IReviewTenantReader } from '../../domain/ports/review-tenant-reader.port';
import { CreateReviewUseCase } from './create-review.use-case';

const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'user-1';
const BOOKING_ID = 'booking-1';
const PREFIX = `reviews/${TENANT_ID}/${CUSTOMER_ID}/${BOOKING_ID}`;

const BOOKING: EligibleBooking = {
  id: BOOKING_ID,
  listingId: 'listing-1',
  groupId: 'group-1',
  partnerId: 'partner-1',
};

interface Options {
  tenantId?: string | null;
  booking?: EligibleBooking | null;
}

function harness(options: Options = {}) {
  const inserted: Array<{ review: NewReview; media: unknown }> = [];
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
    useCase: new CreateReviewUseCase(
      fakePort<IReviewRepository>({
        findEligibleBooking: () =>
          Promise.resolve(options.booking === undefined ? BOOKING : options.booking),
        insert: (_tx, _tenantId, review, media) => {
          inserted.push({ review, media });
          return Promise.resolve({
            id: 'review-1',
            listingId: review.listingId,
            groupId: review.groupId,
          } as unknown as ReviewRecord);
        },
      }),
      fakePort<IReviewTenantReader>({
        resolveTenantId: () =>
          Promise.resolve(options.tenantId === undefined ? TENANT_ID : options.tenantId),
      }),
      fakePort<StoragePort>({ publicUrlForKey: (key) => `https://cdn/${key}` }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    inserted,
    events,
  };
}

const input = (overrides: Partial<CreateReviewInput> = {}) =>
  ({
    bookingId: BOOKING_ID,
    rating: 5,
    content: 'Sân đẹp, chủ thân thiện.',
    media: [],
    ...overrides,
  }) as CreateReviewInput;

describe('CreateReviewUseCase', () => {
  it('answers not-found for an unknown host', async () => {
    const { useCase, inserted } = harness({ tenantId: null });

    await expect(
      useCase.execute('nope.vn', CUSTOMER_ID, input()),
    ).rejects.toBeInstanceOf(TenantNotFound);
    expect(inserted).toEqual([]);
  });

  it('refuses a booking this customer may not review', async () => {
    // Eligibility is the repository's join (completed, theirs, not yet
    // reviewed) — the use case refuses on its answer rather than trusting the
    // request.
    const { useCase, inserted } = harness({ booking: null });

    await expect(
      useCase.execute('studiohub.vn', CUSTOMER_ID, input()),
    ).rejects.toBeInstanceOf(ReviewBookingNotEligible);
    expect(inserted).toEqual([]);
  });

  it('REFUSES a media key outside this booking’s own prefix', async () => {
    // Otherwise a customer could attach another customer's uploaded photos to
    // their review.
    const { useCase, inserted } = harness();

    await expect(
      useCase.execute(
        'studiohub.vn',
        CUSTOMER_ID,
        input({ media: [{ key: `reviews/${TENANT_ID}/user-2/${BOOKING_ID}/a.jpg` }] as never }),
      ),
    ).rejects.toBeInstanceOf(InvalidReviewMedia);
    expect(inserted).toEqual([]);
  });

  it('refuses a key that walks out of the prefix with ..', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(
        'studiohub.vn',
        CUSTOMER_ID,
        input({ media: [{ key: `${PREFIX}/../../other/a.jpg` }] as never }),
      ),
    ).rejects.toBeInstanceOf(InvalidReviewMedia);
  });

  it('refuses a file type that is neither image nor video', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(
        'studiohub.vn',
        CUSTOMER_ID,
        input({ media: [{ key: `${PREFIX}/malware.exe` }] as never }),
      ),
    ).rejects.toBeInstanceOf(InvalidReviewMedia);
  });

  it('refuses DUPLICATE media keys', async () => {
    // The same upload attached twice would render twice and inflate the media
    // count.
    const { useCase, inserted } = harness();

    await expect(
      useCase.execute(
        'studiohub.vn',
        CUSTOMER_ID,
        input({
          media: [{ key: `${PREFIX}/a.jpg` }, { key: `${PREFIX}/a.jpg` }] as never,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidReviewMedia);
    expect(inserted).toEqual([]);
  });

  it('classifies each key by extension and resolves its public URL', async () => {
    const { useCase, inserted } = harness();

    await useCase.execute(
      'studiohub.vn',
      CUSTOMER_ID,
      input({ media: [{ key: `${PREFIX}/a.JPG` }, { key: `${PREFIX}/b.mp4` }] as never }),
    );

    expect(inserted[0]?.media).toEqual([
      { kind: 'image', key: `${PREFIX}/a.JPG`, url: `https://cdn/${PREFIX}/a.JPG` },
      { kind: 'video', key: `${PREFIX}/b.mp4`, url: `https://cdn/${PREFIX}/b.mp4` },
    ]);
  });

  it('takes the listing and partner from the BOOKING, not the request', async () => {
    // A review has to attach to what was actually booked.
    const { useCase, inserted, tenantDb } = harness();

    await useCase.execute('studiohub.vn', CUSTOMER_ID, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(inserted[0]?.review).toMatchObject({
      bookingId: BOOKING_ID,
      listingId: 'listing-1',
      groupId: 'group-1',
      partnerId: 'partner-1',
      customerId: CUSTOMER_ID,
      rating: 5,
    });
  });

  it('announces the review with its listing and group, for the rating rollups', async () => {
    const { useCase, events } = harness();

    await useCase.execute('studiohub.vn', CUSTOMER_ID, input());

    expect(events).toEqual([
      {
        eventType: 'review.created',
        payload: { reviewId: 'review-1', listingId: 'listing-1', groupId: 'group-1' },
      },
    ]);
  });
});
