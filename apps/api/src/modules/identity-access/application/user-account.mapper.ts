import type { CurrentUser } from '@booking/contracts';
import type { UserAccount } from '../domain/entities/user-account.entity';
import type { UserRecord } from '../domain/ports/user-repository.port';

/** Keep aggregate state private while preserving the frozen cross-module result shape. */
export function toUserRecord(user: UserAccount): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    status: user.status,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

/** The `CurrentUser` wire shape — one place, so `/auth/me`, `/auth/session`,
 * login, register and the profile edit can never disagree on it. */
export function toCurrentUser(user: UserRecord): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    locale: user.locale as CurrentUser['locale'],
    status: user.status,
  };
}
