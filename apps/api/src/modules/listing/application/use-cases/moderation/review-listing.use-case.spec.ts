import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound } from '../../../domain/errors/listing-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { ReviewListingUseCase } from './review-listing.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';

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

function harness(
  record: ListingRecord | null,
  pendingPayload: Record<string, unknown> | null = null,
) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ReviewListingUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(record) }),
      fakePort<IListingRevisionRepository>({
        findPending: () =>
          Promise.resolve((pendingPayload ? { payload: pendingPayload } : null) as never),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('ReviewListingUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).rejects.toBeInstanceOf(ListingNotFound);
  });

  it('reviews the live row when no edit is waiting', async () => {
    const { useCase, tenantDb } = harness(listing());

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).resolves.toMatchObject({
      listingId: LISTING_ID,
      checklistPassed: true,
      contactFlags: [],
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('reviews the listing AS IT WOULD BE after approval', async () => {
    // The row itself was screened at its first publication. A phone number added
    // by a later edit lives only in the pending revision, so scanning the row
    // would never see it — and approving would publish it.
    const { useCase } = harness(listing(), { description: 'Liên hệ 0901234567 để đặt' });

    const review = await useCase.execute(TENANT_ID, LISTING_ID);

    expect(review.contactFlags.length).toBeGreaterThan(0);
  });

  it('leaves fields the revision does not touch alone', async () => {
    const { useCase } = harness(listing(), { title: 'Studio A (mới)' });

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).resolves.toMatchObject({
      checklistPassed: true,
      contactFlags: [],
    });
  });
});
