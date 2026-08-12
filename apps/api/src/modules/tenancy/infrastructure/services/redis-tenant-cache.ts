import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type { CachedHost, ITenantCache, TenantHostKind } from '../../domain/ports/tenant-cache.port';

const TTL_SECONDS = 60;
/** Sentinel stored for a negatively-cached (unknown) host. */
const NEGATIVE = '';

@Injectable()
export class RedisTenantCache implements ITenantCache {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * `v2` because the stored shape changed from a bare tenant id to
   * `<tenantId>:<kind>`. Without the bump, a freshly deployed process would read
   * v1 entries still inside their 60s TTL and take the whole string as a tenant id.
   */
  private key(hostname: string): string {
    return `host:v2:${hostname}`;
  }

  async getHost(hostname: string): Promise<CachedHost | null | undefined> {
    const value = await this.redis.get(this.key(hostname));
    if (value === null) return undefined; // miss
    if (value === NEGATIVE) return null; // negatively cached
    const separator = value.lastIndexOf(':');
    if (separator === -1) return undefined; // unreadable — treat as a miss and re-resolve
    const tenantId = value.slice(0, separator);
    const kind = value.slice(separator + 1);
    if (kind !== 'storefront' && kind !== 'dashboard') return undefined;
    return { tenantId, kind: kind as TenantHostKind };
  }

  async setHost(hostname: string, value: CachedHost | null): Promise<void> {
    const stored = value ? `${value.tenantId}:${value.kind}` : NEGATIVE;
    await this.redis.set(this.key(hostname), stored, 'EX', TTL_SECONDS);
  }

  async invalidateHost(hostname: string): Promise<void> {
    await this.redis.del(this.key(hostname));
  }
}
