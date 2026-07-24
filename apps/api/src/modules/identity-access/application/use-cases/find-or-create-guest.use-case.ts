import { Inject, Injectable } from '@nestjs/common';
import { UserAccount } from '../../domain/entities/user-account.entity';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type UserRecord,
} from '../../domain/ports/user-repository.port';
import { toUserRecord } from '../user-account.mapper';

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
    const reusableGuest = UserAccount.reuseGuest(existing);
    if (reusableGuest) return toUserRecord(reusableGuest);
    return this.users.create(UserAccount.createGuest(input));
  }
}
