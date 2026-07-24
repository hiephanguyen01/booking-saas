import type { AuthChallengeResponse, RegistrationStartInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UserAccount } from '../../domain/entities/user-account.entity';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from '../../domain/ports/auth-email-sender.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';
import { toResponse } from './auth-challenge.helpers';

@Injectable()
export class StartRegistrationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: IAuthEmailSender,
  ) {}

  async execute(input: RegistrationStartInput): Promise<AuthChallengeResponse> {
    const existing = await this.users.findByEmail(input.email);
    UserAccount.assertEmailAvailable(existing);
    const challenge = await this.challenges.issue({
      purpose: 'registration',
      email: input.email,
      fullName: input.fullName,
      locale: input.locale,
    });
    await this.email.sendOtp({
      purpose: 'registration',
      email: input.email,
      fullName: input.fullName,
      locale: input.locale,
      otp: challenge.otp,
      expiresInSec: challenge.expiresInSec,
    });
    return toResponse(challenge, input.email);
  }
}
