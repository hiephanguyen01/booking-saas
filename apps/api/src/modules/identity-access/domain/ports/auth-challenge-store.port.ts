export const AUTH_CHALLENGE_STORE = Symbol('AUTH_CHALLENGE_STORE');

export type AuthChallengePurpose = 'registration' | 'password_reset';

export interface AuthChallengePayload {
  purpose: AuthChallengePurpose;
  email: string;
  locale: 'vi' | 'en';
  fullName?: string;
  userId?: string;
}

export interface IssuedAuthChallenge {
  challengeId: string;
  otp: string;
  expiresInSec: number;
  resendAfterSec: number;
}

export type ResendChallengeResult =
  | { status: 'issued'; challenge: IssuedAuthChallenge; payload: AuthChallengePayload }
  | { status: 'cooldown'; retryAfterSec: number }
  | { status: 'expired' };

export type VerifyChallengeResult =
  | { status: 'verified'; completionToken: string; expiresInSec: number }
  | { status: 'invalid'; attemptsRemaining: number }
  | { status: 'expired' }
  | { status: 'locked' };

export interface IAuthChallengeStore {
  issue(payload: AuthChallengePayload): Promise<IssuedAuthChallenge>;
  resend(challengeId: string, purpose: AuthChallengePurpose): Promise<ResendChallengeResult>;
  verify(
    challengeId: string,
    purpose: AuthChallengePurpose,
    otp: string,
  ): Promise<VerifyChallengeResult>;
  consumeCompletion(
    completionToken: string,
    purpose: AuthChallengePurpose,
  ): Promise<AuthChallengePayload | null>;
}
