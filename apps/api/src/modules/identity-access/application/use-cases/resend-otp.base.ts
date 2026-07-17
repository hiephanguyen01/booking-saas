import type { AuthChallengeInput, AuthChallengeResponse } from '@booking/contracts';
import { HttpException } from '@nestjs/common';
import type {
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';
import { expired, toResponse } from './auth-challenge.helpers';

/** Shared resend-OTP flow — extended per purpose; never registered as a provider. */
export abstract class ResendOtpUseCase {
  constructor(
    protected readonly challenges: IAuthChallengeStore,
    protected readonly email: IAuthEmailSender,
    private readonly purpose: AuthChallengePurpose,
  ) {}

  async execute(input: AuthChallengeInput): Promise<AuthChallengeResponse> {
    const result = await this.challenges.resend(input.challengeId, this.purpose);
    if (result.status === 'expired') expired();
    if (result.status === 'cooldown') {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'RESEND_COOLDOWN',
          message: 'Please wait before requesting another code',
          retryAfterSec: result.retryAfterSec,
        },
        429,
      );
    }
    if (result.payload.purpose === 'registration' || result.payload.userId) {
      await this.email.sendOtp({
        purpose: result.payload.purpose,
        email: result.payload.email,
        fullName: result.payload.fullName,
        locale: result.payload.locale,
        otp: result.challenge.otp,
        expiresInSec: result.challenge.expiresInSec,
      });
    }
    return toResponse(result.challenge, result.payload.email);
  }
}
