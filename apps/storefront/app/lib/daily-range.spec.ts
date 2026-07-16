import { describe, expect, it } from 'vitest';
import { isDailyRangeEligible, normalizeDailyRange } from './daily-range';

describe('normalizeDailyRange', () => {
  it('normalizes a same-date UI selection to one half-open day', () => {
    expect(normalizeDailyRange('2026-08-10', '2026-08-10')).toEqual({
      selectedFrom: '2026-08-10',
      selectedTo: '2026-08-10',
      from: '2026-08-10',
      to: '2026-08-11',
      nights: 1,
    });
  });

  it('preserves a complete increasing range', () => {
    expect(normalizeDailyRange('2026-08-10', '2026-08-13')).toMatchObject({
      from: '2026-08-10',
      to: '2026-08-13',
      nights: 3,
    });
  });

  it.each([
    [undefined, undefined],
    ['2026-08-10', undefined],
    ['10-08-2026', '2026-08-10'],
    ['2026-08-11', '2026-08-10'],
  ])('rejects incomplete, malformed, or reversed input: %s → %s', (from, to) => {
    expect(normalizeDailyRange(from, to)).toBeNull();
  });
});

describe('isDailyRangeEligible', () => {
  const oneDay = normalizeDailyRange('2026-08-10', '2026-08-10')!;

  it('accepts one day when the listing minimum is one night', () => {
    expect(isDailyRangeEligible(oneDay, 1, null)).toBe(true);
  });

  it('rejects one day outside listing night limits', () => {
    expect(isDailyRangeEligible(oneDay, 2, null)).toBe(false);
    expect(isDailyRangeEligible(oneDay, 1, 0)).toBe(false);
  });
});
