import { describe, expect, it } from 'vitest';

import { resolveTimeline, type TimelineEntry } from './timeline';

describe('resolveTimeline', () => {
  it('returns an empty array for no entries', () => {
    expect(resolveTimeline([])).toEqual([]);
  });

  it('marks only the last row as last and formats each timestamp in TZ', () => {
    const entries: TimelineEntry[] = [
      { label: 'Tạo', at: '2026-07-15T22:00:00.000Z' },
      { label: 'Đã xác nhận', at: '2026-07-16T01:30:00.000Z' },
    ];
    const rows = resolveTimeline(entries);

    expect(rows.map((r) => r.isLast)).toEqual([false, true]);
    // 22:00Z is 05:00 next day in +07:00; vi-VN renders time-first.
    expect(rows[0].time).toBe('05:00 16/07/2026');
    expect(rows[1].time).toBe('08:30 16/07/2026');
    expect(rows[0].entry.label).toBe('Tạo');
  });
});
