import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type { Interval } from '../../domain/availability/interval';
import type { IHoldReader } from '../../domain/ports/hold-reader.port';

/**
 * Reads holds from the same Redis ZSET the booking module's hold store writes to
 * (§10 Layer 1): key `holds:{resourceId}`, members `startMs:endMs:holdId` scored
 * by their expiry epoch (ms). The booking module owns the writer; scheduling only
 * reads, so — to respect module boundaries — it re-declares the key shape here
 * rather than importing across modules. Members whose score is `> now` are still
 * live; expired members are ignored (and the writer prunes them on the next
 * acquire), so a naturally-expired hold never surfaces as busy.
 */
@Injectable()
export class RedisHoldReader implements IHoldReader {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(resourceId: string): string {
    return `holds:${resourceId}`;
  }

  async activeHolds(resourceId: string, fromUtc: Date, toUtc: Date): Promise<Interval[]> {
    const now = Date.now();
    // score > now → unexpired (score is the expiry epoch in ms).
    const members = await this.redis.zrangebyscore(this.key(resourceId), `(${now}`, '+inf');
    const holds: Interval[] = [];
    for (const member of members) {
      const match = /^(\d+):(\d+):/.exec(member);
      if (!match) continue;
      const start = new Date(Number(match[1]));
      const end = new Date(Number(match[2]));
      // Half-open overlap with the queried range `[fromUtc, toUtc)`.
      if (start < toUtc && fromUtc < end) holds.push({ start, end });
    }
    return holds;
  }
}
