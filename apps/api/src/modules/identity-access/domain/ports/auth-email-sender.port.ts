import type { AuthChallengePurpose } from './auth-challenge-store.port';

export const AUTH_EMAIL_SENDER = Symbol('AUTH_EMAIL_SENDER');

export interface IAuthEmailSender {
  sendOtp(input: {
    purpose: AuthChallengePurpose;
    email: string;
    fullName?: string;
    locale: 'vi' | 'en';
    otp: string;
    expiresInSec: number;
  }): Promise<void>;
}
