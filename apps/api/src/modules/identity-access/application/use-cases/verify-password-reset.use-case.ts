import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { VerifyOtpUseCase } from './verify-otp.base';

@Injectable()
export class VerifyPasswordResetUseCase extends VerifyOtpUseCase {
  constructor(@Inject(AUTH_CHALLENGE_STORE) challenges: IAuthChallengeStore) {
    super(challenges, 'password_reset');
  }
}
