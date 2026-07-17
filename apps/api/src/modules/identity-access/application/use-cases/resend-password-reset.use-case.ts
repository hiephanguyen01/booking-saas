import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from '../../domain/ports/auth-email-sender.port';
import { ResendOtpUseCase } from './resend-otp.base';

@Injectable()
export class ResendPasswordResetUseCase extends ResendOtpUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) email: IAuthEmailSender,
  ) {
    super(challenges, email, 'password_reset');
  }
}
