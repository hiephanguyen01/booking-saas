import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput } from '@booking/contracts';
import { isLocked, recordFailure, recordSuccess } from '../../domain/login-lockout';
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

const INVALID_CREDENTIALS = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password',
};

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
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const now = new Date();
    if (isLocked(user, now)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_LOCKED',
        message: 'Account temporarily locked after too many failed attempts',
      });
    }
    if (user.status !== 'active') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Account is suspended',
      });
    }
    // Guest-checkout users have no password (§8.6) — they can never password-log-in.
    if (user.passwordHash === null) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await this.hasher.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.users.updateLockout(user.id, recordFailure(user, now));
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    await this.users.updateLockout(user.id, recordSuccess());
    const tokens = await this.sessions.create(user.id, meta);
    return { user, tokens };
  }
}
