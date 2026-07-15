import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { RedisAuthChallengeStore } from './redis-auth-challenge.store';

function fakeRedis() {
  const values = new Map<string, string>();
  const api = {
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async set(key: string, value: string) {
      values.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return values.delete(key) ? 1 : 0;
    },
    async ttl(key: string) {
      return values.has(key) ? 600 : -2;
    },
    async getdel(key: string) {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    },
    multi() {
      const jobs: Array<() => void> = [];
      const chain = {
        del(key: string) {
          jobs.push(() => {
            values.delete(key);
          });
          return chain;
        },
        set(key: string, value: string) {
          jobs.push(() => {
            values.set(key, value);
          });
          return chain;
        },
        async exec() {
          jobs.forEach((job) => job());
          return [];
        },
      };
      return chain;
    },
    values,
  };
  return api;
}

describe('RedisAuthChallengeStore', () => {
  it('stores only the OTP hash and makes both stages single-use', async () => {
    const redis = fakeRedis();
    const store = new RedisAuthChallengeStore(redis as unknown as Redis);
    const issued = await store.issue({
      purpose: 'registration',
      email: 'a@example.com',
      fullName: 'A',
      locale: 'vi',
    });
    expect([...redis.values.values()].join('')).not.toContain(issued.otp);

    const verified = await store.verify(issued.challengeId, 'registration', issued.otp);
    expect(verified.status).toBe('verified');
    if (verified.status !== 'verified') return;
    expect(await store.verify(issued.challengeId, 'registration', issued.otp)).toEqual({
      status: 'expired',
    });
    expect(await store.consumeCompletion(verified.completionToken, 'registration')).toMatchObject({
      email: 'a@example.com',
    });
    expect(await store.consumeCompletion(verified.completionToken, 'registration')).toBeNull();
  });

  it('burns a challenge after five invalid attempts', async () => {
    const store = new RedisAuthChallengeStore(fakeRedis() as unknown as Redis);
    const issued = await store.issue({
      purpose: 'password_reset',
      email: 'a@example.com',
      locale: 'en',
    });
    for (let attempt = 4; attempt > 0; attempt -= 1) {
      await expect(store.verify(issued.challengeId, 'password_reset', '999999')).resolves.toEqual({
        status: 'invalid',
        attemptsRemaining: attempt,
      });
    }
    await expect(store.verify(issued.challengeId, 'password_reset', '999999')).resolves.toEqual({
      status: 'locked',
    });
    await expect(store.verify(issued.challengeId, 'password_reset', issued.otp)).resolves.toEqual({
      status: 'expired',
    });
  });

  it('enforces the resend cooldown', async () => {
    const store = new RedisAuthChallengeStore(fakeRedis() as unknown as Redis);
    const issued = await store.issue({
      purpose: 'registration',
      email: 'a@example.com',
      locale: 'vi',
    });
    const result = await store.resend(issued.challengeId, 'registration');
    expect(result.status).toBe('cooldown');
  });
});
