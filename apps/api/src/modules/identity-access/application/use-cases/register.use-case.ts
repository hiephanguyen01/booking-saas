import { Inject, Injectable } from '@nestjs/common';
import type { RegisterInput } from '@booking/contracts';
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

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(
    input: RegisterInput,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ user: UserRecord; tokens: SessionTokens }> {
    const existing = await this.users.findByEmail(input.email);
    UserAccount.assertEmailAvailable(existing);
    const passwordHash = await this.hasher.hash(input.password);
    const newUser = UserAccount.register({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      locale: input.locale,
      emailVerifiedAt: null,
    });
    const user = await this.users.create(newUser);
    const tokens = await this.sessions.create(user.id, meta);
    return { user, tokens };
  }
}
