import { describe, expect, it } from 'vitest';
import { applyLiveHolds, generateHourlySlots, type HourlySlotInput } from './slot-generator';
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
    maxDurationHours: 1, // single-duration by default; overridden per test
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    leadTimeMin: 0,
    priceAt: () => '300000',
    ...overrides,
  };
}

const iso = (d: Date) => d.toISOString();

describe('generateHourlySlots', () => {
  it('walks the granularity grid, leaving room for a min-duration booking', () => {
    const slots = generateHourlySlots(base());
    expect(slots).toHaveLength(8); // starts 02:00…09:00, one duration each
    expect(slots[0]!.startUtc.toISOString()).toBe('2026-03-10T02:00:00.000Z');
    expect(slots.at(-1)!.startUtc.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(slots.every((s) => s.available)).toBe(true);
    expect(slots[0]!.price).toBe('300000');
  });

  it('hides slots earlier than now + leadTime', () => {
    const slots = generateHourlySlots(
      base({ now: new Date('2026-03-10T04:30:00Z'), leadTimeMin: 60 }), // earliest 05:30
    );
    const at = (t: string) => slots.find((s) => s.startUtc.toISOString() === t)!;
    expect(at('2026-03-10T05:00:00.000Z').available).toBe(false); // before 05:30
    expect(at('2026-03-10T06:00:00.000Z').available).toBe(true);
  });

  it('excludes slots whose buffered window overlaps a booking (by resource)', () => {
    const busy: Interval = {
      start: new Date('2026-03-10T05:00:00Z'),
      end: new Date('2026-03-10T06:00:00Z'),
    };
    const slots = generateHourlySlots(base({ busy: [busy], bufferBeforeMin: 15, bufferAfterMin: 15 }));
    const at = (t: string) => slots.find((s) => s.startUtc.toISOString() === t)!;
    // 04:00–05:00 buffered to [03:45,05:15) overlaps the 05:00 booking → busy.
    expect(at('2026-03-10T04:00:00.000Z').available).toBe(false);
    // 06:00–07:00 buffered to [05:45,07:15) overlaps → busy.
    expect(at('2026-03-10T06:00:00.000Z').available).toBe(false);
    // 03:00–04:00 buffered to [02:45,04:15) is clear → available.
    expect(at('2026-03-10T03:00:00.000Z').available).toBe(true);
  });

  it('respects a 2-hour min duration (fewer, longer slots)', () => {
    const slots = generateHourlySlots(base({ minDurationHours: 2, maxDurationHours: 2 }));
    expect(slots).toHaveLength(7); // 02:00…08:00 (08:00+2h=10:00)
    expect(slots[0]!.endUtc.toISOString()).toBe('2026-03-10T04:00:00.000Z');
  });

  it('emits a slot per (start, duration) from min to max, bounded by the window', () => {
    const slots = generateHourlySlots(base({ minDurationHours: 1, maxDurationHours: 3 }));
    // 02:00 gets three durations (1h/2h/3h → 03:00/04:00/05:00).
    const at2 = slots.filter((s) => iso(s.startUtc) === '2026-03-10T02:00:00.000Z');
    expect(at2.map((s) => iso(s.endUtc))).toEqual([
      '2026-03-10T03:00:00.000Z',
      '2026-03-10T04:00:00.000Z',
      '2026-03-10T05:00:00.000Z',
    ]);
    // 09:00 only fits the 1h duration (09:00+2h=11:00 overruns the 10:00 window).
    const at9 = slots.filter((s) => iso(s.startUtc) === '2026-03-10T09:00:00.000Z');
    expect(at9).toHaveLength(1);
    // Six full-triple starts (02:00–07:00) + 08:00×2 + 09:00×1 = 21.
    expect(slots).toHaveLength(21);
  });

  it('surfaces block/bundle pricing on the matching duration (§9.1 step 4)', () => {
    const threeHourMs = 3 * 60 * 60_000;
    const slots = generateHourlySlots(
      base({
        minDurationHours: 1,
        maxDurationHours: 3,
        // A 3-hour bundle is cheaper than 3 × per-hour.
        priceAt: (s, e) => (e.getTime() - s.getTime() === threeHourMs ? '750000' : '300000'),
      }),
    );
    const at2 = slots.filter((s) => iso(s.startUtc) === '2026-03-10T02:00:00.000Z');
    expect(at2.find((s) => iso(s.endUtc) === '2026-03-10T05:00:00.000Z')!.price).toBe('750000');
    expect(at2.find((s) => iso(s.endUtc) === '2026-03-10T03:00:00.000Z')!.price).toBe('300000');
  });
});

describe('applyLiveHolds', () => {
  const slots = generateHourlySlots(base());

  it('flips an available slot busy when a hold overlaps its buffered window', () => {
    const hold: Interval = {
      start: new Date('2026-03-10T05:10:00Z'),
      end: new Date('2026-03-10T05:50:00Z'),
    };
    const merged = applyLiveHolds(slots, { bufferBeforeMin: 15, bufferAfterMin: 15, holds: [hold] });
    const at = (t: string) => merged.find((s) => iso(s.startUtc) === t)!;
    // 05:00–06:00 buffered to [04:45,06:15) overlaps the hold → now busy.
    expect(at('2026-03-10T05:00:00.000Z').available).toBe(false);
    // 02:00–03:00 is far from the hold → still available.
    expect(at('2026-03-10T02:00:00.000Z').available).toBe(true);
  });

  it('is a no-op when there are no live holds (expired holds leave no ghost)', () => {
    const merged = applyLiveHolds(slots, { bufferBeforeMin: 15, bufferAfterMin: 15, holds: [] });
    expect(merged.every((s) => s.available)).toBe(true);
  });
});
