import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type { Interval } from '../../../scheduling/domain/availability/interval';
import type { IHoldReader } from '../../domain/ports/hold-reader.port';

/**
 * Reads holds from the same Redis ZSET the booking module's hold store writes to
 * (§10 Layer 1): key `holds:{resourceId}`, members `startMs:endMs:holdId` scored
 * by their expiry epoch (ms). The booking module owns the writer; catalog only
 * reads, so — to respect module boundaries — it re-declares the key shape here
 * rather than importing across modules. Pipelined over the whole candidate set
 * because a search page evaluates many resources at once.
 */
@Injectable()
export class RedisHoldReader implements IHoldReader {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async activeHoldsByResource(
    resourceIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Interval[]>> {
    if (!resourceIds.length) return new Map();
    const pipeline = this.redis.pipeline();
    const now = Date.now();
    for (const id of resourceIds) pipeline.zrangebyscore(`holds:${id}`, `(${now}`, '+inf');
    const result = await pipeline.exec();
    const grouped = new Map<string, Interval[]>();
    resourceIds.forEach((id, index) => {
      const members = (result?.[index]?.[1] as string[] | undefined) ?? [];
      const intervals = members.flatMap((member) => {
        const match = /^(\d+):(\d+):/.exec(member);
        if (!match) return [];
        const interval = { start: new Date(Number(match[1])), end: new Date(Number(match[2])) };
        return interval.start < to && from < interval.end ? [interval] : [];
      });
      grouped.set(id, intervals);
    });
    return grouped;
  }
}
