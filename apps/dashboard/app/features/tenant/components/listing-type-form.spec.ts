import { createListingTypeInputSchema } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import { listingTypeFormDefaultValues } from './listing-type-form';

describe('listingTypeFormDefaultValues', () => {
  it('produces valid defaults for a new standalone listing type', () => {
    const defaults = listingTypeFormDefaultValues();
    const parsed = createListingTypeInputSchema.safeParse({
      ...defaults,
      name: 'Studio',
      slug: 'studio-test',
    });

    expect(defaults.itemLabel).toBeUndefined();
    expect(parsed.success).toBe(true);
  });
});
