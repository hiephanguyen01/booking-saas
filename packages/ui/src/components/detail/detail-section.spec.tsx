import { describe, expect, it } from 'vitest';

import { isDetailSectionEmpty } from './detail-section';

describe('isDetailSectionEmpty', () => {
  it('is empty for nullish, boolean, and whitespace-only children', () => {
    expect(isDetailSectionEmpty(null)).toBe(true);
    expect(isDetailSectionEmpty(undefined)).toBe(true);
    expect(isDetailSectionEmpty(false)).toBe(true);
    expect(isDetailSectionEmpty('')).toBe(true);
    expect(isDetailSectionEmpty('   ')).toBe(true);
    expect(isDetailSectionEmpty([null, false, undefined])).toBe(true);
  });

  it('is not empty when any child carries content', () => {
    expect(isDetailSectionEmpty('text')).toBe(false);
    expect(isDetailSectionEmpty(0)).toBe(false);
    expect(isDetailSectionEmpty([null, 'kept'])).toBe(false);
  });
});
