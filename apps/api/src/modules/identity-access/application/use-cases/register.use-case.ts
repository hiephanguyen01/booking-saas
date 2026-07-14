import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { RegisterInput } from '@booking/contracts';
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
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_TAKEN',
        message: 'Email is already registered',
      });
    }
    const user = await this.users.create({
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
      fullName: input.fullName,
      phone: input.phone,
      locale: input.locale,
    });
    const tokens = await this.sessions.create(user.id, meta);
    return { user, tokens };
  }
}
