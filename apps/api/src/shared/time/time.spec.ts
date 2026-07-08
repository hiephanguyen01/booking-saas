import { describe, expect, it } from 'vitest';
import { addDays, addMinutes, DEFAULT_TIMEZONE, wallClockInZone, zonedTimeToUtc } from './time';

describe('time helpers', () => {
  it('converts a Ho Chi Minh wall-clock time to the correct UTC instant (UTC+7)', () => {
    const utc = zonedTimeToUtc(
      { year: 2026, month: 7, day: 8, hour: 18, minute: 0 },
      DEFAULT_TIMEZONE,
    );
    expect(utc.toISOString()).toBe('2026-07-08T11:00:00.000Z');
  });

  it('round-trips: wall clock of the converted instant matches the input', () => {
    const utc = zonedTimeToUtc({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }, DEFAULT_TIMEZONE);
    const wall = wallClockInZone(utc, DEFAULT_TIMEZONE);
    expect(wall).toMatchObject({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 });
  });

  it('handles a DST-observing zone (America/New_York summer = UTC-4)', () => {
    const utc = zonedTimeToUtc(
      { year: 2026, month: 7, day: 1, hour: 12, minute: 0 },
      'America/New_York',
    );
    expect(utc.toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });

  it('addMinutes/addDays are pure UTC arithmetic', () => {
    const base = new Date('2026-07-08T00:00:00Z');
    expect(addMinutes(base, 90).toISOString()).toBe('2026-07-08T01:30:00.000Z');
    expect(addDays(base, 3).toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });
});
