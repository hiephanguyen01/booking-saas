import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type { ITenantCache } from '../../domain/ports/tenant-cache.port';

const TTL_SECONDS = 60;
/** Sentinel stored for a negatively-cached (unknown) host. */
const NEGATIVE = '';

@Injectable()
export class RedisTenantCache implements ITenantCache {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(hostname: string): string {
    return `host:${hostname}`;
  }

  async getHost(hostname: string): Promise<string | null | undefined> {
    const value = await this.redis.get(this.key(hostname));
    if (value === null) return undefined; // miss
    return value === NEGATIVE ? null : value;
  }

  async setHost(hostname: string, tenantId: string | null): Promise<void> {
    await this.redis.set(this.key(hostname), tenantId ?? NEGATIVE, 'EX', TTL_SECONDS);
  }

  async invalidateHost(hostname: string): Promise<void> {
    await this.redis.del(this.key(hostname));
  }
}
