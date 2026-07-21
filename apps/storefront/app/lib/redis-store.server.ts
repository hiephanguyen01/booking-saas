import { createClient } from 'redis';
import { storefrontEnv } from './env.server';

const DELETE_IF_VALUE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface RedisJsonStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  deleteIfValue(key: string, value: string): Promise<void>;
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
    clientPromise = instance
      .connect()
      .then(() => instance)
      .catch((error: unknown) => {
        // Do not keep a rejected singleton promise forever. A later request can
        // establish a fresh connection after Redis or the network recovers.
        clientPromise = undefined;
        throw error;
      }) as Promise<StorefrontRedisClient>;
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
  async setIfAbsent(key, value, ttlMs) {
    const result = await (await client()).set(key, value, { NX: true, PX: ttlMs });
    return result === 'OK';
  },
  async deleteIfValue(key, value) {
    await (
      await client()
    ).sendCommand(['EVAL', DELETE_IF_VALUE_SCRIPT, '1', key, value]);
  },
  async ping() {
    await (await client()).ping();
  },
};