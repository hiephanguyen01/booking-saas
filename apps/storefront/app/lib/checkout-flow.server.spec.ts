import { beforeEach, describe, expect, it } from 'vitest';
import type { RedisJsonStore } from './redis-store.server';
import { createCheckoutFlowService } from './checkout-flow.server';

describe('checkout flow service', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET_CURRENT = 'checkout-flow-test-secret-at-least-32-characters';
  });

  it('stores booking identity server-side and resolves only the matching code', async () => {
    const records = new Map<string, unknown>();
    const store: RedisJsonStore = {
      async get<T>(key: string) {
        return (records.get(key) as T | undefined) ?? null;
      },
      async set(key, value) {
        records.set(key, value);
      },
      async delete(key) {
        records.delete(key);
      },
    };
    const service = createCheckoutFlowService(store);
    const cookie = await service.create(
      new Request('https://studio.test/vi/checkout'),
      {
        bookingId: 'booking-id-secret',
        bookingCode: 'BK-ABC234',
        listingSlug: 'premium-room',
        locale: 'vi',
      },
    );
    expect(cookie).not.toContain('booking-id-secret');

    const request = new Request('https://studio.test/vi/bookings/BK-ABC234', {
      headers: { cookie },
    });
    await expect(service.readForCode(request, 'BK-ABC234')).resolves.toMatchObject({
      record: { bookingId: 'booking-id-secret', listingSlug: 'premium-room' },
    });
    await expect(service.readForCode(request, 'BK-WRONG')).resolves.toBeNull();
  });

  it('deletes the server-side record when the flow is destroyed', async () => {
    const records = new Map<string, unknown>();
    const store: RedisJsonStore = {
      async get<T>(key: string) {
        return (records.get(key) as T | undefined) ?? null;
      },
      async set(key, value) {
        records.set(key, value);
      },
      async delete(key) {
        records.delete(key);
      },
    };
    const service = createCheckoutFlowService(store);
    const cookie = await service.create(new Request('https://studio.test'), {
      bookingId: 'booking-id-secret',
      bookingCode: 'BK-ABC234',
      listingSlug: 'premium-room',
      locale: 'vi',
    });
    const request = new Request('https://studio.test', { headers: { cookie } });

    const cleared = await service.destroy(request);

    expect(cleared).toContain('Max-Age=0');
    await expect(service.readForCode(request, 'BK-ABC234')).resolves.toBeNull();
  });
});
