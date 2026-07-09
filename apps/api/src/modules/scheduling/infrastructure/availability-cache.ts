import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.module';

/** A cached, priced hourly slot — the booking/config-derived portion only (§9.1). */
export interface CachedSlot {
  startUtc: string;
  endUtc: string;
  available: boolean;
  price: string;
}

/** 60s TTL — bounds staleness of the lead-time boundary that is baked at write time. */
const TTL_SECONDS = 60;

/**
 * Redis cache for the booking/config-derived hourly slots of a `(listing, date)`
 * (§9.1: "Results are cached in Redis by (listing, date) for the booking/config
 * portion only"). Hold state is deliberately NOT cached — the use case merges
 * live holds on top of whatever this returns.
 *
 * Availability is resource-scoped, so invalidation is by resource. Cache entries
 * are keyed by listing, so a per-resource Redis SET indexes every listing/date
 * key written for a resource; invalidation deletes them in one shot without
 * scanning the keyspace.
 */
@Injectable()
export class AvailabilityCache {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private entryKey(listingId: string, date: string): string {
    return `avail:hourly:${listingId}:${date}`;
  }

  private indexKey(resourceId: string): string {
    return `avail:res:${resourceId}`;
  }

  async get(listingId: string, date: string): Promise<CachedSlot[] | null> {
    const raw = await this.redis.get(this.entryKey(listingId, date));
    return raw ? (JSON.parse(raw) as CachedSlot[]) : null;
  }

  async set(resourceId: string, listingId: string, date: string, slots: CachedSlot[]): Promise<void> {
    const key = this.entryKey(listingId, date);
    const index = this.indexKey(resourceId);
    await this.redis
      .multi()
      .set(key, JSON.stringify(slots), 'EX', TTL_SECONDS)
      .sadd(index, key)
      // Outlive the entries so the index never orphans a still-live key.
      .expire(index, TTL_SECONDS + 60)
      .exec();
  }

  /** Drop every cached `(listing, date)` entry for a resource (all listings on it). */
  async invalidateResource(resourceId: string): Promise<void> {
    const index = this.indexKey(resourceId);
    const keys = await this.redis.smembers(index);
    await this.redis.del(index, ...keys);
  }
}
