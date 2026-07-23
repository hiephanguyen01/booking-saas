import { addDays, addMinutes } from '../../../../shared/time/time';

export const ACCESS_TTL_MINUTES = 15;
export const REFRESH_TTL_DAYS = 30;

export interface SessionState {
  id: string;
  userId: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}

export interface NewSession {
  userId: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  revokedAt: null;
  ip: string | null;
  userAgent: string | null;
}

export interface SessionRotationIntent {
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

export interface SessionRevocationIntent {
  revokedAt: Date;
}

/**
 * One opaque-token device session. Only token hashes enter domain state;
 * plaintext token generation and hashing remain adapter responsibilities.
 */
export class Session {
  private constructor(private state: SessionState) {}

  /** Copy persisted state without rejecting or normalizing legacy rows. */
  static rehydrate(state: SessionState): Session {
    return new Session({ ...state });
  }

  static issue(input: {
    userId: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    meta: { ip?: string; userAgent?: string };
    now: Date;
  }): NewSession {
    return {
      userId: input.userId,
      accessTokenHash: input.accessTokenHash,
      accessExpiresAt: addMinutes(input.now, ACCESS_TTL_MINUTES),
      refreshTokenHash: input.refreshTokenHash,
      refreshExpiresAt: addDays(input.now, REFRESH_TTL_DAYS),
      revokedAt: null,
      ip: input.meta.ip ?? null,
      userAgent: input.meta.userAgent ?? null,
    };
  }

  isAccessValid(now: Date): boolean {
    return this.state.revokedAt === null && this.state.accessExpiresAt > now;
  }

  isRefreshEligible(now: Date): boolean {
    return this.state.revokedAt === null && this.state.refreshExpiresAt > now;
  }

  /**
   * Replace both credentials from a later issuance clock. Eligibility is
   * checked separately so token generation stays between the two clock samples.
   */
  rotate(input: {
    accessTokenHash: string;
    refreshTokenHash: string;
    now: Date;
  }): SessionRotationIntent {
    const intent: SessionRotationIntent = {
      accessTokenHash: input.accessTokenHash,
      accessExpiresAt: addMinutes(input.now, ACCESS_TTL_MINUTES),
      refreshTokenHash: input.refreshTokenHash,
      refreshExpiresAt: addDays(input.now, REFRESH_TTL_DAYS),
    };
    this.state = { ...this.state, ...intent };
    return intent;
  }

  static revoke(now: Date): SessionRevocationIntent {
    return { revokedAt: now };
  }

  static revokeAll(now: Date): SessionRevocationIntent {
    return { revokedAt: now };
  }
}
