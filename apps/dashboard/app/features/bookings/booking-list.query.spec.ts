import { describe, expect, it } from 'vitest';
import { bookingListKey, parseBookingStatus } from './booking-list.query';

describe('booking list query', () => {
  it('falls back to all for an unsupported status', () => {
    expect(parseBookingStatus('unknown')).toBe('all');
    expect(parseBookingStatus(null)).toBe('all');
  });

  it('separates cache entries by tenant and URL filter', () => {
    expect(bookingListKey('tenant-a', 'confirmed')).not.toEqual(
      bookingListKey('tenant-b', 'confirmed'),
    );
    expect(bookingListKey('tenant-a', 'confirmed')).not.toEqual(
      bookingListKey('tenant-a', 'cancelled'),
    );
  });
});
