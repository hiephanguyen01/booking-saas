import type { AuthFlowCompleteResponse, AuthPasswordCompleteInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UserAccount } from '../../domain/entities/user-account.entity';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';
import { expired } from './auth-challenge.helpers';

@Injectable()
export class CompleteRegistrationUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: AuthPasswordCompleteInput): Promise<AuthFlowCompleteResponse> {
    const payload = await this.challenges.consumeCompletion(input.completionToken, 'registration');
    if (!payload?.fullName) expired();
    const existing = await this.users.findByEmail(payload.email);
    UserAccount.assertEmailAvailable(existing);
    const passwordHash = await this.hasher.hash(input.password);
    const newUser = UserAccount.register({
      email: payload.email,
      fullName: payload.fullName,
      locale: payload.locale,
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    await this.users.create(newUser);
    return { success: true };
  }
}
