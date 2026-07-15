import { beforeEach, describe, expect, it } from 'vitest';
import type { RedisJsonStore } from './redis-store.server';
import { createStorefrontSessionService } from './session.server';

describe('storefront session service', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET_CURRENT = 'storefront-test-secret-at-least-32-characters';
  });

  it('stores backend tokens server-side and gives the browser only an opaque id', async () => {
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
    const service = createStorefrontSessionService(store);
    const cookie = await service.create({
      accessToken: 'backend-sid-secret',
      refreshToken: 'backend-rid-secret',
      userId: 'u1',
    });
    expect(cookie).not.toContain('backend-sid-secret');
    expect(cookie).not.toContain('backend-rid-secret');
    const request = new Request('https://example.test', { headers: { cookie } });
    await expect(service.read(request)).resolves.toMatchObject({ data: { userId: 'u1' } });
  });
});
