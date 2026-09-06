import { Inject, Injectable } from '@nestjs/common';
import type { UpgradeGuestInput } from '@booking/contracts';
import { UserAccount } from '../../domain/entities/user-account.entity';
import { EmailRegisteredForGuestUpgrade } from '../../domain/errors/identity-access-errors';
import {
  AUTH_CHALLENGE_STORE,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import {
  REGISTRATION_COMPLETION_REPOSITORY,
  type IRegistrationCompletionRepository,
} from '../../domain/ports/registration-completion-repository.port';
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
import { expired } from './auth-challenge.helpers';

/**
 * Guest upgrade-to-account (§8.6): an email-OTP completion token selects the
 * passwordless guest row. The persistence adapter performs a password-null CAS,
 * so a concurrent upgrade cannot overwrite credentials before sign-in.
 */
@Injectable()
export class UpgradeGuestUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(REGISTRATION_COMPLETION_REPOSITORY)
    private readonly registrationCompletion: IRegistrationCompletionRepository,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(
    input: UpgradeGuestInput,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ user: UserRecord; tokens: SessionTokens }> {
    const payload = await this.challenges.peekCompletion(input.completionToken, 'registration');
    if (!payload?.userId) expired();

    const existing = await this.users.findByEmail(payload.email);
    if (existing && existing.id !== payload.userId) expired();
    const guest = UserAccount.requireGuestForUpgrade(existing);
    const passwordHash = await this.hasher.hash(input.password);
    const passwordIntent = guest.changePasswordHash(passwordHash);
    const consent =
      payload.tenantId && payload.acceptedVersionIds?.length
        ? {
            tenantId: payload.tenantId,
            acceptedVersionIds: payload.acceptedVersionIds,
            acceptedLocale: payload.acceptedLocale ?? 'vi',
            ip: meta.ip ?? null,
          }
        : undefined;
    const result = await this.registrationCompletion.upgradeGuest({
      userId: guest.id,
      email: payload.email,
      passwordHash: passwordIntent.passwordHash,
      emailVerifiedAt: new Date(),
      ...(consent ? { consent } : {}),
    });
    if (result.status === 'conflict') throw new EmailRegisteredForGuestUpgrade();
    await this.challenges.consumeCompletion(input.completionToken, 'registration');
    const user = result.user;
    const tokens = await this.sessions.create(user.id, meta);
    return { user, tokens };
  }
}
