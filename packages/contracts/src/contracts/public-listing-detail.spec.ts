import { describe, expect, it } from 'vitest';
import { publicListingDetailResponseSchema } from './listing';

const listing = {
  id: 'listing-1',
  title: 'Phòng chụp Premium',
  slug: 'phong-chup-premium',
  description: null,
  provinceCode: '79',
  provinceName: 'TP. Hồ Chí Minh',
  wardCode: '26734',
  wardName: 'Phường Bến Nghé',
  address: '12 Lê Lợi',
  photos: [],
  attributes: {},
  bookingModes: ['hourly'],
  modeConfig: {},
  depositPercent: 50,
  listingTypeSlug: 'studio',
  group: null,
  trust: {
    identityVerified: true,
    partnerActiveSince: '2025-01-01T00:00:00.000Z',
    partnerName: 'Booking Studio',
    completedBookings: 24,
    avgApprovalResponseSeconds: null,
  },
};

describe('publicListingDetailResponseSchema', () => {
  it('keeps the public cancellation policy used by checkout', () => {
    const parsed = publicListingDetailResponseSchema.parse({
      ...listing,
      cancellationPolicy: {
        id: 'policy-1',
        name: 'Linh hoạt',
        rules: [{ hoursBefore: 48, refundPercent: 100 }],
      },
    });

    expect(parsed.cancellationPolicy).toEqual({
      id: 'policy-1',
      name: 'Linh hoạt',
      rules: [{ hoursBefore: 48, refundPercent: 100 }],
    });
  });

  it('represents listings without a policy explicitly', () => {
    expect(
      publicListingDetailResponseSchema.parse({ ...listing, cancellationPolicy: null })
        .cancellationPolicy,
    ).toBeNull();
  });
});
