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
    locale: user.locale,
    status: user.status,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}
