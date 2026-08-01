import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.module';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import type { CachedSlot, IAvailabilityCache } from '../domain/ports/availability-cache.port';

/** 60s TTL — bounds staleness of the lead-time boundary that is baked at write time. */
const TTL_SECONDS = 60;

/**
 * Redis adapter for {@link IAvailabilityCache}. Cache entries are keyed by
 * listing, so a per-resource Redis SET indexes every listing/date key written
 * for a resource; invalidation deletes them in one shot without scanning the
 * keyspace. Booking-driven invalidation resolves the booking's `resource_id`
 * in-tenant first (availability is resource-scoped → one booking change
 * invalidates every listing on the resource).
 *
 * **Known staleness — sale campaigns.** Cached slots carry their PRICE and,
 * since the storefront started advertising campaigns, their `regularPrice` and
 * `campaignLabel` too — all computed against the clock at write time. Every
 * other input (bookings, rules, opening hours) invalidates this cache on change,
 * but a campaign starting or ending is the passage of time, which nothing emits
 * an event for. So for up to {@link TTL_SECONDS} the storefront can quote a sale
 * that has just expired — or miss one that has just opened. The booking path
 * re-prices against a live clock, so nobody is CHARGED a stale price; only the
 * displayed one lags. The window is unchanged, but it is now more VISIBLE: a
 * stale entry shows a struck-through price and a campaign name, not merely a
 * number nobody can check. Closing the gap properly means invalidating on
 * campaign boundaries (a scheduled sweep), which is deliberately not built here.
 */
@Injectable()
export class RedisAvailabilityCache implements IAvailabilityCache {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tenantDb: TenantDbService,
  ) {}

  private entryKey(listingId: string, date: string, selectionKey: string): string {
    return `avail:hourly:${listingId}:${date}:${selectionKey}`;
  }

  private indexKey(resourceId: string): string {
    return `avail:res:${resourceId}`;
  }

  private listingIndexKey(listingId: string): string {
    return `avail:listing:${listingId}`;
  }

  async get(listingId: string, date: string, selectionKey: string): Promise<CachedSlot[] | null> {
    const raw = await this.redis.get(this.entryKey(listingId, date, selectionKey));
    return raw ? (JSON.parse(raw) as CachedSlot[]) : null;
  }

  async set(
    resourceId: string,
    listingId: string,
    date: string,
    selectionKey: string,
    slots: CachedSlot[],
  ): Promise<void> {
    const key = this.entryKey(listingId, date, selectionKey);
    const index = this.indexKey(resourceId);
    const listingIndex = this.listingIndexKey(listingId);
    await this.redis
      .multi()
      .set(key, JSON.stringify(slots), 'EX', TTL_SECONDS)
      .sadd(index, key)
      .sadd(listingIndex, key)
      // Outlive the entries so the index never orphans a still-live key.
      .expire(index, TTL_SECONDS + 60)
      .expire(listingIndex, TTL_SECONDS + 60)
      .exec();
  }

  async invalidateListing(listingId: string): Promise<void> {
    const index = this.listingIndexKey(listingId);
    const keys = await this.redis.smembers(index);
    await this.redis.del(index, ...keys);
  }

  async invalidateResource(resourceId: string): Promise<void> {
    const index = this.indexKey(resourceId);
    const keys = await this.redis.smembers(index);
    await this.redis.del(index, ...keys);
  }

  async invalidateByBooking(tenantId: string, bookingId: string): Promise<void> {
    const resourceId = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<{ resource_id: string }[]>`
        SELECT resource_id FROM bookings WHERE id = ${bookingId}::uuid`;
      return rows[0]?.resource_id ?? null;
    });
    if (resourceId) await this.invalidateResource(resourceId);
  }
}
