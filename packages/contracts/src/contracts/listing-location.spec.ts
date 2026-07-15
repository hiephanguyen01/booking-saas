import { describe, expect, it } from 'vitest';
import {
  createListingGroupInputSchema,
  createListingInputSchema,
} from './listing';

const location = {
  provinceCode: '79',
  wardCode: '26740',
  address: '12 Nguyễn Huệ',
};

describe('listing location contracts', () => {
  it('requires a two-level address for a listing group', () => {
    const base = {
      partnerId: '11111111-1111-4111-8111-111111111111',
      listingTypeId: '22222222-2222-4222-8222-222222222222',
      title: 'Studio trung tâm',
      slug: 'studio-trung-tam',
    };
    expect(createListingGroupInputSchema.safeParse({ ...base, ...location }).success).toBe(true);
    expect(createListingGroupInputSchema.safeParse(base).success).toBe(false);
  });

  it('requires a two-level address for a standalone or child listing', () => {
    const base = {
      partnerId: '11111111-1111-4111-8111-111111111111',
      listingTypeId: '22222222-2222-4222-8222-222222222222',
      title: 'Phòng A',
      slug: 'phong-a',
      bookingModes: ['hourly'],
      modeConfig: {
        hourly: {
          basePrice: '300000',
          blocks: [],
          minDuration: 1,
          maxDuration: 8,
          granularity: 60,
          leadTimeMin: 0,
        },
      },
    };
    expect(createListingInputSchema.safeParse({ ...base, ...location }).success).toBe(true);
    expect(createListingInputSchema.safeParse(base).success).toBe(false);
  });
});
