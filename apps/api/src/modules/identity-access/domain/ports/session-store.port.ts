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
}
