import { describe, expect, it } from 'vitest';
import {
  createMemoryDashboardSessionStore,
  createRedisDashboardSessionStore,
  parseDashboardSessionRecord,
  type DashboardSessionRecord,
} from './session-store.server';

const record: DashboardSessionRecord = {
  accessToken: 'sid-access-token',
  refreshToken: 'rid-refresh-token',
  userId: 'user-1',
};

describe('DashboardSessionStore', () => {
  it('creates, rotates, and deletes an opaque server-side record', async () => {
    const store = createMemoryDashboardSessionStore();

    await store.set('session-1', record, 60);
    await expect(store.get('session-1')).resolves.toEqual(record);

    const rotated = {
      ...record,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    };
    await store.set('session-1', rotated, 60);
    await expect(store.get('session-1')).resolves.toEqual(rotated);

    await store.delete('session-1');
    await expect(store.get('session-1')).resolves.toBeNull();
  });

  it('rejects malformed persisted data instead of trusting JSON casts', () => {
    expect(parseDashboardSessionRecord(record)).toEqual(record);
    expect(parseDashboardSessionRecord(null)).toBeNull();
    expect(parseDashboardSessionRecord({ ...record, refreshToken: 42 })).toBeNull();
    expect(parseDashboardSessionRecord({ accessToken: 'only-one-field' })).toBeNull();
  });
});

describe('Redis DashboardSessionStore', () => {
  it('uses a namespaced TTL record and validates data read from Redis', async () => {
    const values = new Map<string, string>();
    const writes: Array<{ key: string; ttl: number }> = [];
    const client = {
      async get(key: string) {
        return values.get(key) ?? null;
      },
      async setEx(key: string, ttl: number, value: string) {
        writes.push({ key, ttl });
        values.set(key, value);
        return 'OK';
      },
      async del(key: string) {
        return values.delete(key) ? 1 : 0;
      },
    };
    const store = createRedisDashboardSessionStore({
      getClient: async () => client,
      prefix: 'test:dashboard:session:',
    });

    await store.set('opaque-id', record, 90);
    expect(writes).toEqual([{ key: 'test:dashboard:session:opaque-id', ttl: 90 }]);
    await expect(store.get('opaque-id')).resolves.toEqual(record);

    values.set('test:dashboard:session:opaque-id', JSON.stringify({ accessToken: 123 }));
    await expect(store.get('opaque-id')).resolves.toBeNull();

    await store.delete('opaque-id');
    expect(values.has('test:dashboard:session:opaque-id')).toBe(false);
  });
});
