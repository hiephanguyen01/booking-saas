import { describe, expect, it } from 'vitest';
import type { ReviewMediaPresignInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { ReviewMediaBookingNotEligible } from '../../domain/errors/review-errors';
import type { IReviewRepository } from '../../domain/ports/review-repository.port';
import type { IReviewTenantReader } from '../../domain/ports/review-tenant-reader.port';
import { CreateReviewMediaUploadUseCase } from './create-review-media-upload.use-case';

const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'user-1';
const BOOKING_ID = 'booking-1';

const PRESIGNED = {
  key: 'reviews/tenant-1/user-1/booking-1/abc.jpg',
  uploadUrl: 'https://minio/upload',
  publicUrl: 'https://cdn/abc.jpg',
  expiresInSec: 900,
};

function harness(options: { tenantId?: string | null; eligible?: boolean } = {}) {
  const presigns: Array<{ keyPrefix: string; contentType: string }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new CreateReviewMediaUploadUseCase(
      fakePort<IReviewRepository>({
        isReviewableBooking: () => Promise.resolve(options.eligible ?? true),
      }),
      fakePort<IReviewTenantReader>({
        resolveTenantId: () =>
          Promise.resolve(options.tenantId === undefined ? TENANT_ID : options.tenantId),
      }),
      fakePort<StoragePort>({
        createPresignedUpload: (args) => {
          presigns.push(args as { keyPrefix: string; contentType: string });
          return Promise.resolve(PRESIGNED);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    presigns,
  };
}

const input = { bookingId: BOOKING_ID, contentType: 'image/jpeg' } as ReviewMediaPresignInput;

describe('CreateReviewMediaUploadUseCase', () => {
  it('answers not-found for an unknown host', async () => {
    const { useCase, presigns } = harness({ tenantId: null });

    await expect(useCase.execute('nope.vn', CUSTOMER_ID, input)).rejects.toBeInstanceOf(
      TenantNotFound,
    );
    expect(presigns).toEqual([]);
  });

  it('REFUSES to presign for a booking this customer may not review', async () => {
    // The presign is what grants write access to the bucket prefix; handing one
    // out unconditionally would let anyone upload under any booking.
    const { useCase, presigns } = harness({ eligible: false });

    await expect(
      useCase.execute('studiohub.vn', CUSTOMER_ID, input),
    ).rejects.toBeInstanceOf(ReviewMediaBookingNotEligible);
    expect(presigns).toEqual([]);
  });

  it('scopes the upload prefix to the tenant, the customer AND the booking', async () => {
    // The same prefix the create path validates keys against, so an upload can
    // only ever land where that review will accept it from.
    const { useCase, presigns, tenantDb } = harness();

    const result = await useCase.execute('studiohub.vn', CUSTOMER_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(presigns).toEqual([
      {
        keyPrefix: `reviews/${TENANT_ID}/${CUSTOMER_ID}/${BOOKING_ID}`,
        contentType: 'image/jpeg',
      },
    ]);
    expect(result).toBe(PRESIGNED);
  });
});
