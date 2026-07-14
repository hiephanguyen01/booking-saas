import { describe, expect, it } from 'vitest';
import { normalizedRequestLocation } from './navigation.server';

describe('normalizedRequestLocation', () => {
  it('removes React Router data-request details', () => {
    const request = new Request(
      'https://admin.example/tenant/bookings.data?page=2&_routes=routes%2Ftenant&index',
    );

    expect(normalizedRequestLocation(request)).toBe('/tenant/bookings?page=2');
  });

  it('preserves ordinary application paths, search, and hash', () => {
    const request = new Request('https://admin.example/admin/tenants?page=3#results');

    expect(normalizedRequestLocation(request)).toBe('/admin/tenants?page=3#results');
  });
});
