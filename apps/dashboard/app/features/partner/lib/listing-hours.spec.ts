import { describe, expect, it } from 'vitest';
import type { AvailabilityRuleResponse } from '@booking/contracts';
import {
  decodeWindows,
  encodeWindow,
  overlappingIndices,
  seedWeek,
  toRules,
  validateWeek,
  type WeekWindows,
} from './listing-hours';

/**
 * `PUT /partner/listings/:id/availability-rules` REPLACES the whole rule set, so
 * a weekday with two windows (a split shift) had to survive load → save. It did
 * not: the editor seeded each weekday from `rules.find(...)` — the first match —
 * and PUT one rule per day back, permanently deleting every other window.
 */

function rule(dayOfWeek: number, openTime: string, closeTime: string): AvailabilityRuleResponse {
  return { id: `${dayOfWeek}-${openTime}`, listingId: 'l1', dayOfWeek, openTime, closeTime };
}

/** A Monday split shift plus a normal Tuesday. */
const SPLIT_SHIFT: AvailabilityRuleResponse[] = [
  rule(1, '08:00', '12:00'),
  rule(1, '14:00', '18:00'),
  rule(2, '09:00', '17:00'),
];

/** Load the editor from saved rules and save it back untouched. */
function roundTrip(rules: AvailabilityRuleResponse[]) {
  return toRules(seedWeek(rules));
}

describe('listing hours editor', () => {
  it('keeps BOTH windows of a split-shift weekday on a no-op save', () => {
    expect(roundTrip(SPLIT_SHIFT)).toEqual([
      { dayOfWeek: 1, openTime: '08:00', closeTime: '12:00' },
      { dayOfWeek: 1, openTime: '14:00', closeTime: '18:00' },
      { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00' },
    ]);
  });

  it('seeds every window of a weekday, not just the first', () => {
    expect(seedWeek(SPLIT_SHIFT)[1]).toEqual([
      { open: '08:00', close: '12:00' },
      { open: '14:00', close: '18:00' },
    ]);
  });

  it('sorts a weekday windows by opening time regardless of API order', () => {
    const week = seedWeek([rule(3, '14:00', '18:00'), rule(3, '08:00', '12:00')]);
    expect(week[3]).toEqual([
      { open: '08:00', close: '12:00' },
      { open: '14:00', close: '18:00' },
    ]);
  });

  it('treats a weekday with no rules as closed', () => {
    const week = seedWeek(SPLIT_SHIFT);
    expect(week[0]).toEqual([]);
    expect(week[6]).toEqual([]);
    expect(toRules(week).some((r) => r.dayOfWeek === 0)).toBe(false);
  });

  it('round-trips a window through the hidden form field', () => {
    const encoded = SPLIT_SHIFT.map((r) => encodeWindow(r.dayOfWeek, { open: r.openTime, close: r.closeTime }));
    expect(encoded[0]).toBe('1|08:00|12:00');
    expect(decodeWindows(encoded)).toEqual([
      { dayOfWeek: 1, openTime: '08:00', closeTime: '12:00' },
      { dayOfWeek: 1, openTime: '14:00', closeTime: '18:00' },
      { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00' },
    ]);
  });

  it('drops malformed submitted windows rather than sending junk', () => {
    expect(decodeWindows(['9|08:00|12:00', 'x|08:00|12:00', '1|08:00', '', '1|08:00|12:00'])).toEqual([
      { dayOfWeek: 1, openTime: '08:00', closeTime: '12:00' },
    ]);
  });

  it('flags overlapping windows on the same day', () => {
    expect([...overlappingIndices([
      { open: '08:00', close: '13:00' },
      { open: '12:00', close: '18:00' },
    ])]).toEqual([0, 1]);
  });

  it('allows adjacent, non-overlapping windows', () => {
    expect(overlappingIndices([
      { open: '08:00', close: '12:00' },
      { open: '12:00', close: '18:00' },
    ]).size).toBe(0);
  });

  it('blocks a save when a window closes before it opens', () => {
    const week: WeekWindows = { ...seedWeek([]), 1: [{ open: '18:00', close: '09:00' }] };
    expect(validateWeek(week)).toContain('Thứ 2: giờ đóng phải sau giờ mở.');
  });

  it('blocks a save when a day has overlapping windows', () => {
    const week: WeekWindows = {
      ...seedWeek([]),
      1: [
        { open: '08:00', close: '13:00' },
        { open: '12:00', close: '18:00' },
      ],
    };
    expect(validateWeek(week)).toContain('Thứ 2: các khung giờ bị trùng nhau.');
  });

  it('accepts a valid split shift', () => {
    expect(validateWeek(seedWeek(SPLIT_SHIFT))).toEqual([]);
  });
});
