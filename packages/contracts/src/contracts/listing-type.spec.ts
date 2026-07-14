import { describe, expect, it } from 'vitest';
import { createListingTypeInputSchema, updateListingTypeInputSchema } from './listing-type';

const base = {
  name: 'Không gian sự kiện',
  slug: 'khong-gian-su-kien',
  allowedModes: ['hourly'] as const,
};

describe('listing type structure contract', () => {
  it('keeps existing listing types standalone by default', () => {
    const parsed = createListingTypeInputSchema.parse(base);

    expect(parsed.structure).toBe('standalone');
    expect(parsed.itemLabel).toBeUndefined();
  });

  it.each([
    ['grouped', 'phòng'],
    ['grouped', 'gói dịch vụ'],
    ['flexible', 'sân'],
  ] as const)('accepts %s structure with the tenant item label %s', (structure, itemLabel) => {
    const parsed = createListingTypeInputSchema.parse({ ...base, structure, itemLabel });

    expect(parsed).toMatchObject({ structure, itemLabel });
  });

  it('allows structure and item label to be configured independently on update', () => {
    expect(updateListingTypeInputSchema.parse({ structure: 'grouped', itemLabel: 'combo' })).toEqual({
      structure: 'grouped',
      itemLabel: 'combo',
    });
  });
});
