import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type UserRecord,
} from '../../domain/ports/user-repository.port';

/**
 * Guest checkout (§8.6): resolve a customer by email, creating a passwordless
 * guest user if none exists. Booking under an existing email attaches to that
 * account. Exported for the booking module.
 */
@Injectable()
export class FindOrCreateGuestUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: IUserRepository) {}

  async execute(input: { email: string; fullName: string; phone: string }): Promise<UserRecord> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) return existing;
    return this.users.createGuest(input);
  }
}
