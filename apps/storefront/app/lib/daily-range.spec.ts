import { describe, expect, it } from 'vitest';
import {
  eligibleDailyRange,
  isDailyRangeEligible,
  normalizeDailyRange,
} from './daily-range';

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
    ['2026-02-30', '2026-03-01'],
    ['2026-99-10', '2026-99-11'],
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

describe('eligibleDailyRange', () => {
  it('returns an effective one-day booking range when one night is allowed', () => {
    expect(eligibleDailyRange('2026-08-10', '2026-08-10', 1, null)).toMatchObject({
      selectedFrom: '2026-08-10',
      selectedTo: '2026-08-10',
      from: '2026-08-10',
      to: '2026-08-11',
      nights: 1,
    });
  });

  it('returns null when the normalized range violates listing limits', () => {
    expect(eligibleDailyRange('2026-08-10', '2026-08-10', 2, null)).toBeNull();
    expect(eligibleDailyRange('2026-08-10', '2026-08-12', 1, 1)).toBeNull();
  });

  it('returns null for an incomplete selection', () => {
    expect(eligibleDailyRange('2026-08-10', undefined, 1, null)).toBeNull();
  });
});
