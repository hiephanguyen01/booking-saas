import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpgradeGuestInput } from '@booking/shared';
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

/**
 * Guest upgrade-to-account (§8.6): a passwordless guest-checkout user sets a
 * password and becomes a full account (then is signed in). Mirrors
 * {@link FindOrCreateGuestUseCase}'s guard direction — it REFUSES to touch an
 * email that already owns a password account (that path is a normal login), so
 * an unauthenticated caller can never overwrite a real account's credentials.
 */
@Injectable()
export class UpgradeGuestUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(
    input: UpgradeGuestInput,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ user: UserRecord; tokens: SessionTokens }> {
    const existing = await this.users.findByEmail(input.email);
    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'GUEST_NOT_FOUND',
        message: 'No guest booking found for this email — book first, then upgrade',
      });
    }
    if (existing.passwordHash !== null) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_REGISTERED',
        message: 'This email already has an account — please sign in',
      });
    }
    const user = await this.users.setPassword(existing.id, await this.hasher.hash(input.password));
    const tokens = await this.sessions.create(user.id, meta);
    return { user, tokens };
  }
}
