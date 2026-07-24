import type { AuthFlowCompleteResponse, AuthPasswordCompleteInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UserAccount } from '../../domain/entities/user-account.entity';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import { SESSION_STORE, type ISessionStore } from '../../domain/ports/session-store.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';
import { expired } from './auth-challenge.helpers';

@Injectable()
export class CompletePasswordResetUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(input: AuthPasswordCompleteInput): Promise<AuthFlowCompleteResponse> {
    const payload = await this.challenges.consumeCompletion(
      input.completionToken,
      'password_reset',
    );
    if (!payload) expired();
    if (!payload.userId) return { success: true };
    const passwordHash = await this.hasher.hash(input.password);
    const passwordIntent = UserAccount.resetPasswordHash(passwordHash);
    await this.users.setPassword(payload.userId, passwordIntent.passwordHash);
    await this.sessions.revokeAllForUser(payload.userId);
    return { success: true };
  }
}
