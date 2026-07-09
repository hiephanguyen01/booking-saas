import { describe, expect, it } from 'vitest';
import { generateHourlySlots, type HourlySlotInput } from './slot-generator';
import type { Interval } from './interval';

const window: Interval = {
  start: new Date('2026-03-10T02:00:00Z'),
  end: new Date('2026-03-10T10:00:00Z'), // 8h window
};

function base(overrides: Partial<HourlySlotInput> = {}): HourlySlotInput {
  return {
    openWindows: [window],
    busy: [],
    now: new Date('2026-03-01T00:00:00Z'), // well in the past
    granularityMin: 60,
    minDurationHours: 1,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    leadTimeMin: 0,
    priceAt: () => '300000',
    ...overrides,
  };
}

describe('generateHourlySlots', () => {
  it('walks the granularity grid, leaving room for a min-duration booking', () => {
    const slots = generateHourlySlots(base());
    expect(slots).toHaveLength(8); // starts 02:00…09:00
    expect(slots[0]!.startUtc.toISOString()).toBe('2026-03-10T02:00:00.000Z');
    expect(slots.at(-1)!.startUtc.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(slots.every((s) => s.available)).toBe(true);
    expect(slots[0]!.price).toBe('300000');
  });

  it('hides slots earlier than now + leadTime', () => {
    const slots = generateHourlySlots(
      base({ now: new Date('2026-03-10T04:30:00Z'), leadTimeMin: 60 }), // earliest 05:30
    );
    const at = (iso: string) => slots.find((s) => s.startUtc.toISOString() === iso)!;
    expect(at('2026-03-10T05:00:00.000Z').available).toBe(false); // before 05:30
    expect(at('2026-03-10T06:00:00.000Z').available).toBe(true);
  });

  it('excludes slots whose buffered window overlaps a booking (by resource)', () => {
    const busy: Interval = {
      start: new Date('2026-03-10T05:00:00Z'),
      end: new Date('2026-03-10T06:00:00Z'),
    };
    const slots = generateHourlySlots(base({ busy: [busy], bufferBeforeMin: 15, bufferAfterMin: 15 }));
    const at = (iso: string) => slots.find((s) => s.startUtc.toISOString() === iso)!;
    // 04:00–05:00 buffered to [03:45,05:15) overlaps the 05:00 booking → busy.
    expect(at('2026-03-10T04:00:00.000Z').available).toBe(false);
    // 06:00–07:00 buffered to [05:45,07:15) overlaps → busy.
    expect(at('2026-03-10T06:00:00.000Z').available).toBe(false);
    // 03:00–04:00 buffered to [02:45,04:15) is clear → available.
    expect(at('2026-03-10T03:00:00.000Z').available).toBe(true);
  });

  it('respects a 2-hour min duration (fewer, longer slots)', () => {
    const slots = generateHourlySlots(base({ minDurationHours: 2 }));
    expect(slots).toHaveLength(7); // 02:00…08:00 (08:00+2h=10:00)
    expect(slots[0]!.endUtc.toISOString()).toBe('2026-03-10T04:00:00.000Z');
  });
});
