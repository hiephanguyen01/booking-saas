import type { HourlySlot } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import {
  atomicHourlySlots,
  checkoutHref,
  roomAvailabilityState,
  slotInterval,
  toggleContiguousSlot,
} from './listing-group-utils';

function slot(hour: number): HourlySlot {
  const start = String(hour).padStart(2, '0');
  const end = String(hour + 1).padStart(2, '0');
  return {
    startUtc: `2026-08-10T${start}:00:00.000Z`,
    endUtc: `2026-08-10T${end}:00:00.000Z`,
    available: true,
    price: '780000',
  };
}

describe('listing group booking helpers', () => {
  it('reduces overlapping API durations to atomic hour cells', () => {
    const twoHours = { ...slot(8), endUtc: slot(9).endUtc, price: '500000' };
    const threeHours = { ...slot(8), endUtc: slot(10).endUtc, price: '700000' };
    expect(atomicHourlySlots([twoHours, slot(9), slot(8), threeHours]).map((item) => (
      `${item.startUtc}:${item.endUtc}`
    ))).toEqual([
      `${slot(8).startUtc}:${slot(8).endUtc}`,
      `${slot(9).startUtc}:${slot(9).endUtc}`,
    ]);
  });

  it('selects one slot and extends the range in either direction', () => {
    const middle = toggleContiguousSlot([], slot(9));
    expect(middle.changed).toBe(true);

    const after = toggleContiguousSlot(middle.slots, slot(10));
    const before = toggleContiguousSlot(after.slots, slot(8));
    expect(before.slots.map((item) => item.startUtc)).toEqual([
      slot(8).startUtc,
      slot(9).startUtc,
      slot(10).startUtc,
    ]);
    expect(slotInterval(before.slots)).toEqual({
      start: slot(8).startUtc,
      end: slot(10).endUtc,
    });
  });

  it('rejects a disconnected slot', () => {
    const result = toggleContiguousSlot([slot(8), slot(9)], slot(11));
    expect(result.changed).toBe(false);
    expect(result.slots).toHaveLength(2);
  });

  it('allows removing an edge but not a middle slot', () => {
    const selected = [slot(8), slot(9), slot(10)];
    const middle = toggleContiguousSlot(selected, slot(9));
    expect(middle.changed).toBe(false);

    const edge = toggleContiguousSlot(selected, slot(8));
    expect(edge.changed).toBe(true);
    expect(edge.slots.map((item) => item.startUtc)).toEqual([slot(9).startUtc, slot(10).startUtc]);
  });

  it('builds the existing checkout query shape for hourly and daily bookings', () => {
    const hourly = checkoutHref({
      locale: 'vi',
      listingSlug: 'studio premium',
      mode: 'hourly',
      start: slot(8).startUtc,
      end: slot(9).endUtc,
    });
    const url = new URL(hourly, 'https://storefront.test');
    expect(url.pathname).toBe('/vi/checkout');
    expect(url.searchParams.get('listing')).toBe('studio premium');
    expect(url.searchParams.get('mode')).toBe('hourly');
    expect(url.searchParams.get('start')).toBe(slot(8).startUtc);
    expect(url.searchParams.get('end')).toBe(slot(9).endUtc);

    expect(checkoutHref({
      locale: 'en',
      listingSlug: 'daily-room',
      mode: 'daily',
      start: slot(8).startUtc,
      end: slot(10).endUtc,
    })).toContain('/en/checkout?');
  });

  it('maps room availability without inventing a price', () => {
    expect(roomAvailabilityState({ available: false, price: '100000' })).toBe('booked');
    expect(roomAvailabilityState({ available: true, price: null })).toBe('missing-price');
    expect(roomAvailabilityState({ available: true, price: '100000' })).toBe('available');
  });
});
