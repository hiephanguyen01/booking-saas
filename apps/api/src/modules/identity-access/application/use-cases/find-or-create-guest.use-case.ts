import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type UserRecord,
} from '../../domain/ports/user-repository.port';

/**
 * Guest checkout (§8.6): resolve a customer by email. A prior GUEST (passwordless)
 * user with that email is reused, but an email that belongs to a REGISTERED
 * account is NOT silently attached — that would let an unauthenticated attacker
 * file bookings under the victim's account (and leak account existence). The
 * owner must sign in instead.
 */
@Injectable()
export class FindOrCreateGuestUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: IUserRepository) {}

  async execute(input: { email: string; fullName: string; phone: string }): Promise<UserRecord> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      if (existing.passwordHash !== null) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EMAIL_REGISTERED',
          message: 'This email has an account — please sign in to book',
        });
      }
      return existing; // reuse the prior guest
    }
    return this.users.createGuest(input);
  }
}
