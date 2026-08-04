import type { ChangeMyPasswordInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidCurrentPassword,
  PasswordUnchanged,
  UserNotFound,
} from '../../domain/errors/identity-access-errors';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import { SESSION_STORE, type ISessionStore } from '../../domain/ports/session-store.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';

/**
 * Password change for an already-authenticated user. Unlike the reset flow it
 * proves the current password instead of an emailed OTP, and it keeps the
 * calling session alive while signing every other device out — a credential
 * change should not silently leave a stolen session logged in.
 */
@Injectable()
export class ChangeMyPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(
    principal: { userId: string; sessionId: string },
    input: ChangeMyPasswordInput,
  ): Promise<void> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new UserNotFound();
    const currentHash = user.assertCanChangePassword();

    if (!(await this.hasher.verify(currentHash, input.currentPassword))) {
      throw new InvalidCurrentPassword();
    }
    if (await this.hasher.verify(currentHash, input.newPassword)) {
      throw new PasswordUnchanged();
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.users.setPassword(principal.userId, user.changePasswordHash(passwordHash).passwordHash);
    await this.sessions.revokeOtherSessionsForUser(principal.userId, principal.sessionId);
  }
}
