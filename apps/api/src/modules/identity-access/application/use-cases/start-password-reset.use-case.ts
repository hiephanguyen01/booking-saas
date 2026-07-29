import type { AuthChallengeResponse, PasswordResetStartInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
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
export class StartPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: IAuthEmailSender,
  ) {}

  async execute(input: PasswordResetStartInput): Promise<AuthChallengeResponse> {
    const user = await this.users.findByEmail(input.email);
    const isPasswordAccount = Boolean(user?.passwordHash);
    const challenge = await this.challenges.issue({
      purpose: 'password_reset',
      email: input.email,
      locale: input.locale,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(isPasswordAccount && user ? { userId: user.id, fullName: user.fullName } : {}),
    });
    if (isPasswordAccount && user) {
      await this.email.sendOtp({
        purpose: 'password_reset',
        email: input.email,
        fullName: user.fullName,
        locale: input.locale,
        otp: challenge.otp,
        expiresInSec: challenge.expiresInSec,
        challengeId: challenge.challengeId,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      });
    }
    return toResponse(challenge, input.email);
  }
}
