import { Inject, Injectable } from '@nestjs/common';
import type { UpgradeGuestInput } from '@booking/contracts';
import { UserAccount } from '../../domain/entities/user-account.entity';
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
    const guest = UserAccount.requireGuestForUpgrade(existing);
    const passwordHash = await this.hasher.hash(input.password);
    const passwordIntent = guest.changePasswordHash(passwordHash);
    const user = await this.users.setPassword(guest.id, passwordIntent.passwordHash);
    const tokens = await this.sessions.create(user.id, meta);
    return { user, tokens };
  }
}
