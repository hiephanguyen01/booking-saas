import type { CurrentUser, UpdateMyProfileInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { UserNotFound } from '../../domain/errors/identity-access-errors';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';
import { toCurrentUser } from '../user-account.mapper';

/**
 * Self-service profile edit for the signed-in user (storefront account centre).
 * Deliberately narrow: name, phone and photo only. Email is the login identity
 * and needs its own OTP-verified flow, and locale follows the UI, not this form.
 */
@Injectable()
export class UpdateMyProfileUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: IUserRepository) {}

  async execute(userId: string, input: UpdateMyProfileInput): Promise<CurrentUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFound();
    const intent = user.changeProfile(input);
    return toCurrentUser(await this.users.updateProfile(userId, intent));
  }
}
