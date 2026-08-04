export const SESSION_STORE = Symbol('SESSION_STORE');

export interface SessionTokens {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface SessionPrincipal {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
  status: string;
}

export interface ISessionStore {
  create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<SessionTokens>;
  /** Returns the principal when the access token is valid and not expired/revoked. */
  findByAccessToken(accessToken: string): Promise<SessionPrincipal | null>;
  /** Rotates both tokens; returns null when the refresh token is invalid. */
  rotate(refreshToken: string): Promise<SessionTokens | null>;
  revoke(sessionId: string): Promise<void>;
  /** Revokes every active device after a credential reset. */
  revokeAllForUser(userId: string): Promise<void>;
  /**
   * Revokes every active device except the one that made the change — used by a
   * signed-in password change, which should sign other devices out without
   * logging the user out of the tab they are working in.
   */
  revokeOtherSessionsForUser(userId: string, keepSessionId: string): Promise<void>;
}
