import { createClient } from 'redis';
import { storefrontEnv } from './env.server';

export interface RedisJsonStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  ping(): Promise<void>;
}

type StorefrontRedisClient = ReturnType<typeof createClient>;
let clientPromise: Promise<StorefrontRedisClient> | undefined;

async function client() {
  if (!clientPromise) {
    const instance = createClient({ url: storefrontEnv.redisUrl });
    instance.on('error', (error: Error) =>
      console.error('Storefront Redis connection error', error),
    );
    clientPromise = instance.connect().then(() => instance) as Promise<StorefrontRedisClient>;
  }
  return clientPromise;
}

export const storefrontRedisStore: RedisJsonStore = {
  async get<T>(key: string) {
    const value = await (await client()).get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      await (await client()).del(key);
      return null;
    }
  },
  async set(key, value, ttlSeconds) {
    await (await client()).setEx(key, ttlSeconds, JSON.stringify(value));
  },
  async delete(key) {
    await (await client()).del(key);
  },
  async ping() {
    await (await client()).ping();
  },
};
