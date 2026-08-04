import { Injectable } from '@nestjs/common';
import type { Session as PrismaSession } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
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
 * Opaque-token session store: the DB only ever holds SHA-256 hashes, so a DB
 * leak does not leak usable tokens. Refresh rotation replaces both tokens on
 * the same row; a presented-but-already-rotated token simply no longer matches
 * and is rejected.
 */
@Injectable()
export class PrismaSessionStore implements ISessionStore {
  constructor(private readonly prisma: PrismaService) {}

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
    const session = await this.prisma.admin.session.findUnique({
      where: { accessTokenHash: sha256(accessToken) },
      include: { user: true },
    });
    if (!session) return null;
    if (!toSession(session).isAccessValid(new Date())) return null;
    return {
      sessionId: session.id,
      userId: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      phone: session.user.phone,
      avatarUrl: session.user.avatarUrl,
      locale: session.user.locale,
      status: session.user.status,
    };
  }

  async rotate(refreshToken: string): Promise<SessionTokens | null> {
    const session = await this.prisma.admin.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!session) return null;
    const aggregate = toSession(session);
    if (!aggregate.isRefreshEligible(new Date())) return null;
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
    await this.prisma.admin.session.update({
      where: { id: sessionId },
      data: Session.revoke(new Date()),
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.admin.session.updateMany({
      where: { userId, revokedAt: null },
      data: Session.revokeAll(new Date()),
    });
  }

  async revokeOtherSessionsForUser(userId: string, keepSessionId: string): Promise<void> {
    await this.prisma.admin.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: Session.revokeAll(new Date()),
    });
  }
}
