import { describe, expect, it } from 'vitest';
import { openWindowsForDate, type WeeklyRule } from './open-windows';

const tuesday: WeeklyRule[] = [{ dayOfWeek: 2, openTime: '09:00', closeTime: '17:00' }];

describe('openWindowsForDate', () => {
  it('builds UTC windows from weekly rules in the resource timezone (ICT +07:00)', () => {
    // 2026-03-10 is a Tuesday.
    const w = openWindowsForDate('2026-03-10', 'Asia/Ho_Chi_Minh', tuesday);
    expect(w).toHaveLength(1);
    expect(w[0]!.start.toISOString()).toBe('2026-03-10T02:00:00.000Z'); // 09:00 ICT
    expect(w[0]!.end.toISOString()).toBe('2026-03-10T10:00:00.000Z'); // 17:00 ICT
  });

  it('returns no windows on a weekday with no rule', () => {
    expect(openWindowsForDate('2026-03-09', 'Asia/Ho_Chi_Minh', tuesday)).toEqual([]); // Monday
  });

  it('a closed exception empties the day; custom_hours overrides the rule', () => {
    expect(openWindowsForDate('2026-03-10', 'Asia/Ho_Chi_Minh', tuesday, { type: 'closed' })).toEqual([]);

    const custom = openWindowsForDate('2026-03-10', 'Asia/Ho_Chi_Minh', tuesday, {
      type: 'custom_hours',
      openTime: '12:00',
      closeTime: '14:00',
    });
    expect(custom).toHaveLength(1);
    expect(custom[0]!.start.toISOString()).toBe('2026-03-10T05:00:00.000Z'); // 12:00 ICT
    expect(custom[0]!.end.toISOString()).toBe('2026-03-10T07:00:00.000Z'); // 14:00 ICT
  });

  it('handles a DST timezone correctly (America/New_York)', () => {
    const sunday: WeeklyRule[] = [{ dayOfWeek: 0, openTime: '09:00', closeTime: '17:00' }];
    // 2026-03-08 is the US spring-forward Sunday; by 09:00 the clocks are EDT (-04:00).
    const edt = openWindowsForDate('2026-03-08', 'America/New_York', sunday);
    expect(edt[0]!.start.toISOString()).toBe('2026-03-08T13:00:00.000Z'); // 09:00 EDT
    // A winter Sunday is EST (-05:00): 09:00 → 14:00 UTC.
    const est = openWindowsForDate('2026-01-11', 'America/New_York', sunday);
    expect(est[0]!.start.toISOString()).toBe('2026-01-11T14:00:00.000Z');
  });
});
