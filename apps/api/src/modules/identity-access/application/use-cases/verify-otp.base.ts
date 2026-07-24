import type { AuthOtpVerifiedResponse, AuthOtpVerifyInput } from '@booking/contracts';
import type {
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { expired } from './auth-challenge.helpers';
import {
  OtpAttemptsExceeded,
  OtpInvalid,
} from '../auth-challenge-http-errors';

/** Shared verify-OTP flow — extended per purpose; never registered as a provider. */
export abstract class VerifyOtpUseCase {
  constructor(
    private readonly challenges: IAuthChallengeStore,
    private readonly purpose: AuthChallengePurpose,
  ) {}

  async execute(input: AuthOtpVerifyInput): Promise<AuthOtpVerifiedResponse> {
    const result = await this.challenges.verify(input.challengeId, this.purpose, input.code);
    if (result.status === 'expired') expired();
    if (result.status === 'locked') {
      throw new OtpAttemptsExceeded();
    }
    if (result.status === 'invalid') {
      throw new OtpInvalid(result.attemptsRemaining);
    }
    return { completionToken: result.completionToken, expiresInSec: result.expiresInSec };
  }
}
