import { describe, expect, it } from 'vitest';
import { computeDay } from './day-availability';
import type { Interval } from './interval';

const night: Interval = {
  start: new Date('2026-03-10T07:00:00Z'), // 14:00 ICT check-in
  end: new Date('2026-03-11T05:00:00Z'), // 12:00 ICT check-out next day
};
const openWindows: Interval[] = [night];

describe('computeDay (daily calendar)', () => {
  it('marks a bookable night available with its price', () => {
    expect(computeDay({ openWindows, closedByException: false, night, busy: [], price: '900000' })).toEqual({
      status: 'available',
      price: '900000',
    });
  });

  it('marks a night covered by a booking as booked', () => {
    const busy: Interval = { start: new Date('2026-03-10T09:00:00Z'), end: new Date('2026-03-10T12:00:00Z') };
    expect(computeDay({ openWindows, closedByException: false, night, busy: [busy], price: '900000' })).toEqual({
      status: 'booked',
      price: '900000',
    });
  });

  it('marks a closed exception as blocked', () => {
    expect(
      computeDay({ openWindows: [], closedByException: true, night: null, busy: [], price: null }),
    ).toEqual({ status: 'blocked', price: null });
  });

  it('marks a day with no open window as closed', () => {
    expect(
      computeDay({ openWindows: [], closedByException: false, night: null, busy: [], price: null }),
    ).toEqual({ status: 'closed', price: null });
  });
});
