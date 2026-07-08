import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ISessionStore,
  SessionPrincipal,
  SessionTokens,
} from '../../domain/ports/session-store.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export const ACCESS_TTL_MINUTES = 15;
export const REFRESH_TTL_DAYS = 30;

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('hex');

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
    const now = Date.now();
    const session = await this.prisma.admin.session.create({
      data: {
        userId,
        accessTokenHash: sha256(accessToken),
        accessExpiresAt: new Date(now + ACCESS_TTL_MINUTES * 60_000),
        refreshTokenHash: sha256(refreshToken),
        refreshExpiresAt: new Date(now + REFRESH_TTL_DAYS * 86_400_000),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
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
    if (!session || session.revokedAt || session.accessExpiresAt <= new Date()) {
      return null;
    }
    return {
      sessionId: session.id,
      userId: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      phone: session.user.phone,
      locale: session.user.locale,
      status: session.user.status,
    };
  }

  async rotate(refreshToken: string): Promise<SessionTokens | null> {
    const session = await this.prisma.admin.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!session || session.revokedAt || session.refreshExpiresAt <= new Date()) {
      return null;
    }
    const nextAccess = newToken();
    const nextRefresh = newToken();
    const now = Date.now();
    const updated = await this.prisma.admin.session.update({
      where: { id: session.id },
      data: {
        accessTokenHash: sha256(nextAccess),
        accessExpiresAt: new Date(now + ACCESS_TTL_MINUTES * 60_000),
        refreshTokenHash: sha256(nextRefresh),
        refreshExpiresAt: new Date(now + REFRESH_TTL_DAYS * 86_400_000),
      },
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
      data: { revokedAt: new Date() },
    });
  }
}
