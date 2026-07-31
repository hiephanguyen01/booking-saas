import type {
  AuthChallengePayload,
  AuthChallengePurpose,
} from '../ports/auth-challenge-store.port';

export const OTP_TTL_SEC = 600;
export const RESEND_AFTER_SEC = 60;
export const COMPLETION_TTL_SEC = 1800;
export const MAX_ATTEMPTS = 5;

export interface AuthChallengeState {
  purpose: AuthChallengePurpose;
  email: string;
  locale: 'vi' | 'en';
  fullName?: string;
  userId?: string;
  tenantId?: string;
  acceptedVersionIds?: string[];
  acceptedLocale?: 'vi' | 'en';
  otpHash: string;
  attempts: number;
  resendAt: number;
}

export type AuthChallengeResendDecision =
  { status: 'ready' } | { status: 'cooldown'; retryAfterSec: number };

export type AuthChallengeVerifyTransition =
  | { status: 'verified' }
  | { status: 'invalid'; attemptsRemaining: number; state: AuthChallengeState }
  | { status: 'locked' };

/**
 * One Redis-backed OTP challenge. State contains only the OTP hash; clock,
 * hashing, timing-safe comparison, and plaintext credentials stay outside.
 */
export class AuthChallenge {
  private constructor(private state: AuthChallengeState) {}

  /** Copy unversioned Redis state without validating or normalizing legacy JSON. */
  static rehydrate(state: AuthChallengeState): AuthChallenge {
    return new AuthChallenge({ ...state });
  }

  /** Preserve payload property order for the existing unversioned JSON protocol. */
  static issue(payload: AuthChallengePayload, otpHash: string, nowMs: number): AuthChallengeState {
    return {
      ...payload,
      otpHash,
      attempts: 0,
      resendAt: nowMs + RESEND_AFTER_SEC * 1_000,
    };
  }

  get purpose(): AuthChallengePurpose {
    return this.state.purpose;
  }

  get otpHash(): string {
    return this.state.otpHash;
  }

  resendDecision(nowMs: number): AuthChallengeResendDecision {
    const retryAfterSec = Math.ceil((this.state.resendAt - nowMs) / 1_000);
    return retryAfterSec > 0 ? { status: 'cooldown', retryAfterSec } : { status: 'ready' };
  }

  /** Reset attempts and cooldown while retaining the same challenge identity. */
  resend(otpHash: string, nowMs: number): AuthChallengeState {
    const next = AuthChallenge.issue(this.payload(), otpHash, nowMs);
    this.state = { ...next };
    return next;
  }

  verify(otpMatches: boolean): AuthChallengeVerifyTransition {
    if (otpMatches) return { status: 'verified' };

    const attempts = this.state.attempts + 1;
    this.state = { ...this.state, attempts };
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attempts);
    if (attemptsRemaining === 0) return { status: 'locked' };
    return {
      status: 'invalid',
      attemptsRemaining,
      state: { ...this.state },
    };
  }

  /** Preserve the legacy truthy-only optional-field projection and key order. */
  payload(): AuthChallengePayload {
    return {
      purpose: this.state.purpose,
      email: this.state.email,
      locale: this.state.locale,
      ...(this.state.fullName ? { fullName: this.state.fullName } : {}),
      ...(this.state.userId ? { userId: this.state.userId } : {}),
      ...(this.state.tenantId ? { tenantId: this.state.tenantId } : {}),
      ...(this.state.acceptedVersionIds?.length
        ? { acceptedVersionIds: this.state.acceptedVersionIds }
        : {}),
      ...(this.state.acceptedLocale ? { acceptedLocale: this.state.acceptedLocale } : {}),
    };
  }
}
