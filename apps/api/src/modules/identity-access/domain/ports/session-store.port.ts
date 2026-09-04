import type { SessionPrincipal } from '../../../../shared/http/session-principal';

export const SESSION_STORE = Symbol('SESSION_STORE');

export interface SessionTokens {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Canonical definition moved to `shared/http/session-principal.ts` — see that file for why.
 * Re-exported here so every existing importer of `SessionPrincipal` from this path keeps working
 * untouched. Do not delete this re-export or move the type back: `identity-access` already depends
 * on `notification` (the OTP-email adapter), so a `SessionPrincipal` defined here would close a
 * module cycle the moment any other module needs it — which the notification inbox now does.
 */
export type { SessionPrincipal };

export interface ISessionStore {
  create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<SessionTokens>;
  /** Returns the principal when the access token is valid and not expired/revoked. */
  findByAccessToken(accessToken: string): Promise<SessionPrincipal | null>;
  /** Login time for the active session; refresh rotation is deliberately not re-authentication. */
  authenticationTime(sessionId: string, userId: string): Promise<Date | null>;
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
