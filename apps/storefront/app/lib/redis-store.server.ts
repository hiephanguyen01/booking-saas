import { createClient } from 'redis';
import { storefrontEnv } from './env.server';

const DELETE_IF_VALUE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const EXTEND_IF_VALUE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

export interface RedisJsonStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  extendIfValue(key: string, value: string, ttlMs: number): Promise<boolean>;
  deleteIfValue(key: string, value: string): Promise<void>;
  ping(): Promise<void>;
}

const createStorefrontRedisClient = () => createClient({ url: storefrontEnv.redisUrl });
type StorefrontRedisClient = ReturnType<typeof createStorefrontRedisClient>;
let clientPromise: Promise<StorefrontRedisClient> | undefined;

async function client(): Promise<StorefrontRedisClient> {
  let pending = clientPromise;
  if (!pending) {
    const instance = createStorefrontRedisClient();
    instance.on('error', (error: Error) =>
      console.error('Storefront Redis connection error', error),
    );
    pending = instance
      .connect()
      .then(() => instance)
      .catch((error: unknown) => {
        // A rejected promise must not remain cached for the lifetime of the
        // process. Let readiness probes and later requests attempt reconnecting.
        clientPromise = undefined;
        throw error;
      });
    clientPromise = pending;
  }
  return pending;
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
  async extendIfValue(key, value, ttlMs) {
    const result = await (
      await client()
    ).sendCommand(['EVAL', EXTEND_IF_VALUE_SCRIPT, '1', key, value, String(ttlMs)]);
    return Number(result) === 1;
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
