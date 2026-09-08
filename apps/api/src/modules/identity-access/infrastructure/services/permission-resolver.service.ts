import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type {
  IPermissionResolver,
  PermissionScope,
} from '../../domain/ports/permission-resolver.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { REDIS } from '../../../../shared/redis/redis.module';

const CACHE_TTL_SECONDS = 60;

/**
 * Resolves a user's permission keys within a scope from role_assignments
 * (TONG-QUAN.md §14.4), cached in Redis by user+scope. The lookup runs on the
 * admin pool: it happens before any tenant context exists, and checking the
 * assignment's tenant/partner IS the membership verification — the client can
 * only name a scope, never grant itself one.
 */
@Injectable()
export class PermissionResolverService implements IPermissionResolver {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private cacheKey(userId: string, scope: PermissionScope): string {
    return `perms:${userId}:${scope.tenantId ?? '-'}:${scope.partnerId ?? '-'}`;
  }

  private indexKey(userId: string): string {
    return `perms-index:${userId}`;
  }

  async resolve(userId: string, scope: PermissionScope): Promise<Set<string>> {
    const key = this.cacheKey(userId, scope);
    const cached = await this.redis.get(key);
    if (cached !== null) {
      return new Set(cached ? cached.split(',') : []);
    }
    const assignments = await this.prisma.admin.roleAssignment.findMany({
      where: {
        userId,
        tenantId: scope.tenantId ?? null,
        partnerId: scope.partnerId ?? null,
      },
      include: { role: { include: { rolePermissions: true } } },
    });
    const keys = new Set<string>();
    for (const a of assignments) {
      for (const rp of a.role.rolePermissions) {
        keys.add(rp.permissionKey);
      }
    }
    const index = this.indexKey(userId);
    await this.redis
      .multi()
      .set(key, [...keys].join(','), 'EX', CACHE_TTL_SECONDS)
      .sadd(index, key)
      .expire(index, CACHE_TTL_SECONDS + 30)
      .exec();
    return keys;
  }

  async invalidate(userId: string): Promise<void> {
    const index = this.indexKey(userId);
    const keys = await this.redis.smembers(index);
    if (keys.length > 0) {
      await this.redis.del(index, ...keys);
    } else {
      await this.redis.del(index);
    }
  }
}
