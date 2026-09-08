import { Inject, Injectable } from '@nestjs/common';
import type { Session as PrismaSession } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { REDIS } from '../../../../shared/redis/redis.module';
import {
  ACCESS_TTL_MINUTES,
  REFRESH_TTL_DAYS,
  Session,
} from '../../domain/entities/session.entity';
import type {
  ISessionStore,
  SessionPrincipal,
  SessionTokens,
} from '../../domain/ports/session-store.port';

export { ACCESS_TTL_MINUTES, REFRESH_TTL_DAYS };

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('hex');
const cacheKey = (hash: string) => `sess:${hash}`;

function toSession(row: PrismaSession): Session {
  return Session.rehydrate({
    id: row.id,
    userId: row.userId,
    accessTokenHash: row.accessTokenHash,
    accessExpiresAt: row.accessExpiresAt,
    refreshTokenHash: row.refreshTokenHash,
    refreshExpiresAt: row.refreshExpiresAt,
    revokedAt: row.revokedAt,
    ip: row.ip,
    userAgent: row.userAgent,
  });
}

/**
 * Opaque-token session store with L1 Redis cache: the DB only ever holds
 * SHA-256 hashes, so a DB leak does not leak usable tokens. Active sessions
 * are cached in Redis to minimize PostgreSQL connection load on authenticated
 * requests. Refresh rotation and revocations invalidate the cached access
 * tokens immediately.
 */
@Injectable()
export class PrismaSessionStore implements ISessionStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async authenticationTime(sessionId: string, userId: string): Promise<Date | null> {
    const session = await this.prisma.admin.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { createdAt: true },
    });
    return session?.createdAt ?? null;
  }

  async create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<SessionTokens> {
    const accessToken = newToken();
    const refreshToken = newToken();
    const issuanceNow = new Date(Date.now());
    const newSession = Session.issue({
      userId,
      accessTokenHash: sha256(accessToken),
      refreshTokenHash: sha256(refreshToken),
      meta,
      now: issuanceNow,
    });
    const session = await this.prisma.admin.session.create({
      data: newSession,
    });
    return {
      sessionId: session.id,
      accessToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
    };
  }

  async findByAccessToken(accessToken: string): Promise<SessionPrincipal | null> {
    const hash = sha256(accessToken);
    const key = cacheKey(hash);

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached) as SessionPrincipal;
      }
    } catch {
      // Non-fatal cache read failure — fallback to DB query
    }

    const session = await this.prisma.admin.session.findUnique({
      where: { accessTokenHash: hash },
      include: { user: true },
    });
    if (!session) return null;
    if (!toSession(session).isAccessValid(new Date())) return null;

    const principal: SessionPrincipal = {
      sessionId: session.id,
      userId: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      phone: session.user.phone,
      avatarUrl: session.user.avatarUrl,
      locale: session.user.locale,
      status: session.user.status,
    };

    try {
      const remainingSec = Math.floor((session.accessExpiresAt.getTime() - Date.now()) / 1000);
      if (remainingSec > 0) {
        await this.redis.set(key, JSON.stringify(principal), 'EX', remainingSec);
      }
    } catch {
      // Non-fatal cache write failure
    }

    return principal;
  }

  async rotate(refreshToken: string): Promise<SessionTokens | null> {
    const session = await this.prisma.admin.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!session) return null;
    const aggregate = toSession(session);
    if (!aggregate.isRefreshEligible(new Date())) return null;

    // Evict old access token from cache
    try {
      await this.redis.del(cacheKey(session.accessTokenHash));
    } catch {
      // Non-fatal cache eviction failure
    }

    const nextAccess = newToken();
    const nextRefresh = newToken();
    const issuanceNow = new Date(Date.now());
    const rotation = aggregate.rotate({
      accessTokenHash: sha256(nextAccess),
      refreshTokenHash: sha256(nextRefresh),
      now: issuanceNow,
    });
    const updated = await this.prisma.admin.session.update({
      where: { id: session.id },
      data: rotation,
    });
    return {
      sessionId: updated.id,
      accessToken: nextAccess,
      accessExpiresAt: updated.accessExpiresAt,
      refreshToken: nextRefresh,
      refreshExpiresAt: updated.refreshExpiresAt,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.prisma.admin.session.findUnique({
      where: { id: sessionId },
      select: { accessTokenHash: true },
    });
    if (session?.accessTokenHash) {
      try {
        await this.redis.del(cacheKey(session.accessTokenHash));
      } catch {
        // Non-fatal cache eviction failure
      }
    }
    await this.prisma.admin.session.update({
      where: { id: sessionId },
      data: Session.revoke(new Date()),
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const activeSessions = await this.prisma.admin.session.findMany({
      where: { userId, revokedAt: null },
      select: { accessTokenHash: true },
    });
    if (activeSessions.length > 0) {
      try {
        await this.redis.del(...activeSessions.map((s) => cacheKey(s.accessTokenHash)));
      } catch {
        // Non-fatal cache eviction failure
      }
    }
    await this.prisma.admin.session.updateMany({
      where: { userId, revokedAt: null },
      data: Session.revokeAll(new Date()),
    });
  }

  async revokeOtherSessionsForUser(userId: string, keepSessionId: string): Promise<void> {
    const otherSessions = await this.prisma.admin.session.findMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      select: { accessTokenHash: true },
    });
    if (otherSessions.length > 0) {
      try {
        await this.redis.del(...otherSessions.map((s) => cacheKey(s.accessTokenHash)));
      } catch {
        // Non-fatal cache eviction failure
      }
    }
    await this.prisma.admin.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: Session.revokeAll(new Date()),
    });
  }
}
