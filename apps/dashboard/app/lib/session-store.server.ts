import { createClient } from 'redis';

export interface DashboardSessionRecord {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export interface DashboardSessionStore {
  get(id: string): Promise<DashboardSessionRecord | null>;
  set(id: string, record: DashboardSessionRecord, ttlSeconds: number): Promise<void>;
  delete(id: string): Promise<void>;
}

interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface RedisDashboardSessionStoreOptions {
  getClient: () => Promise<RedisSessionClient>;
  prefix?: string;
}

export function parseDashboardSessionRecord(value: unknown): DashboardSessionRecord | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.accessToken !== 'string' ||
    !candidate.accessToken ||
    typeof candidate.refreshToken !== 'string' ||
    !candidate.refreshToken ||
    typeof candidate.userId !== 'string' ||
    !candidate.userId
  ) {
    return null;
  }

  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    userId: candidate.userId,
  };
}

export function createRedisDashboardSessionStore({
  getClient,
  prefix = 'bookingos:dashboard:session:',
}: RedisDashboardSessionStoreOptions): DashboardSessionStore {
  const keyFor = (id: string) => `${prefix}${id}`;

  return {
    async get(id) {
      const client = await getClient();
      const raw = await client.get(keyFor(id));
      if (!raw) return null;

      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        await client.del(keyFor(id));
        return null;
      }

      const record = parseDashboardSessionRecord(decoded);
      if (!record) await client.del(keyFor(id));
      return record;
    },

    async set(id, record, ttlSeconds) {
      const client = await getClient();
      await client.setEx(keyFor(id), ttlSeconds, JSON.stringify(record));
    },

    async delete(id) {
      const client = await getClient();
      await client.del(keyFor(id));
    },
  };
}

let redisClientPromise: Promise<RedisSessionClient> | undefined;

async function getDefaultRedisClient(): Promise<RedisSessionClient> {
  if (!redisClientPromise) {
    const client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
    client.on('error', (error) => {
      console.error('Dashboard Redis connection error', error);
    });
    redisClientPromise = client.connect().then(() => client);
  }
  return redisClientPromise;
}

let defaultDashboardSessionStore: DashboardSessionStore | undefined;

export function getDashboardSessionStore(): DashboardSessionStore {
  if (!defaultDashboardSessionStore) {
    defaultDashboardSessionStore = createRedisDashboardSessionStore({
      getClient: getDefaultRedisClient,
    });
  }
  return defaultDashboardSessionStore;
}
