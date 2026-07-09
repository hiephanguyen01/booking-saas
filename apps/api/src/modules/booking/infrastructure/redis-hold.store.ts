import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.module';
import type { IHoldStore } from '../domain/ports/hold-store.port';

const TTL_MS = 600_000; // 10-minute hold (§10)

/**
 * Redis hold (§10 Layer 1). A ZSET per resource holds live intervals
 * (`startMs:endMs:holdId`, scored by expiry epoch). Acquire atomically drops
 * expired members, checks time-range overlap (a hash-of-slot key would miss
 * 14–16 vs 15–17), and reserves if clear. The Postgres exclusion constraint is
 * the hard Layer-2 guarantee.
 */
const ACQUIRE = `
local now = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', '(' .. now)
local startMs = tonumber(ARGV[1])
local endMs = tonumber(ARGV[2])
for _, m in ipairs(redis.call('ZRANGE', KEYS[1], 0, -1)) do
  local s, e = m:match('(%d+):(%d+):')
  if s and startMs < tonumber(e) and tonumber(s) < endMs then
    return 0
  end
end
redis.call('ZADD', KEYS[1], ARGV[4], ARGV[1] .. ':' .. ARGV[2] .. ':' .. ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]) - now + 1000)
return 1`;

const RELEASE = `
for _, m in ipairs(redis.call('ZRANGE', KEYS[1], 0, -1)) do
  if m:match(':([^:]+)$') == ARGV[1] then
    redis.call('ZREM', KEYS[1], m)
  end
end
return 1`;

@Injectable()
export class RedisHoldStore implements IHoldStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(resourceId: string): string {
    return `holds:${resourceId}`;
  }

  async acquire(resourceId: string, startUtc: Date, endUtc: Date): Promise<string | null> {
    const holdId = randomUUID();
    const now = Date.now();
    const ok = await this.redis.eval(
      ACQUIRE,
      1,
      this.key(resourceId),
      String(startUtc.getTime()),
      String(endUtc.getTime()),
      holdId,
      String(now + TTL_MS),
      String(now),
    );
    return ok === 1 ? holdId : null;
  }

  async release(resourceId: string, holdId: string): Promise<void> {
    await this.redis.eval(RELEASE, 1, this.key(resourceId), holdId);
  }
}
