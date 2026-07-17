import type { AuthOtpVerifiedResponse, AuthOtpVerifyInput } from '@booking/contracts';
import { BadRequestException, HttpException } from '@nestjs/common';
import type {
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { expired } from './auth-challenge.helpers';

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
      throw new HttpException(
        { statusCode: 429, code: 'OTP_ATTEMPTS_EXCEEDED', message: 'Too many invalid attempts' },
        429,
      );
    }
    if (result.status === 'invalid') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'OTP_INVALID',
        message: 'The verification code is invalid',
        attemptsRemaining: result.attemptsRemaining,
      });
    }
    return { completionToken: result.completionToken, expiresInSec: result.expiresInSec };
  }
}
