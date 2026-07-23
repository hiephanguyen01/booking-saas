import { Inject, Injectable } from '@nestjs/common';
import type { LoginInput } from '@booking/contracts';
import { InvalidCredentials } from '../../domain/errors/identity-access-errors';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import {
  SESSION_STORE,
  type ISessionStore,
  type SessionTokens,
} from '../../domain/ports/session-store.port';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type UserRecord,
} from '../../domain/ports/user-repository.port';
import { toUserRecord } from '../user-account.mapper';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(
    input: LoginInput,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ user: UserRecord; tokens: SessionTokens }> {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new InvalidCredentials();
    const now = new Date();
    const passwordHash = user.assertCanPasswordLogin(now);
    const valid = await this.hasher.verify(passwordHash, input.password);
    if (!valid) {
      const lockoutIntent = user.recordLoginFailure(now);
      await this.users.updateLockout(user.id, lockoutIntent);
      throw new InvalidCredentials();
    }
    const userRecord = toUserRecord(user);
    const lockoutIntent = user.recordLoginSuccess();
    await this.users.updateLockout(user.id, lockoutIntent);
    const tokens = await this.sessions.create(user.id, meta);
    return { user: userRecord, tokens };
  }
}
