import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * UserAccount-owned domain errors. Code, status, and message are frozen to the
 * pre-refactor HTTP contract.
 *
 * Challenge errors with top-level response fields deliberately remain at their
 * existing application boundary.
 */

export class EmailTaken extends DomainError {
  constructor() {
    super('EMAIL_TAKEN', 409, 'Email is already registered');
  }
}

/** Guest checkout must not attach a booking to an existing password account. */
export class EmailRegisteredForGuestBooking extends DomainError {
  constructor() {
    super('EMAIL_REGISTERED', 409, 'This email has an account — please sign in to book');
  }
}

/** Guest upgrade must not overwrite an existing password account. */
export class EmailRegisteredForGuestUpgrade extends DomainError {
  constructor() {
    super('EMAIL_REGISTERED', 409, 'This email already has an account — please sign in');
  }
}

export class GuestNotFound extends DomainError {
  constructor() {
    super(
      'GUEST_NOT_FOUND',
      404,
      'No guest booking found for this email — book first, then upgrade',
    );
  }
}

export class InvalidCredentials extends DomainError {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class AccountLocked extends DomainError {
  constructor() {
    super('ACCOUNT_LOCKED', 403, 'Account temporarily locked after too many failed attempts');
  }
}

export class AccountSuspended extends DomainError {
  constructor() {
    super('ACCOUNT_SUSPENDED', 403, 'Account is suspended');
  }
}

/** The session names a user row that no longer exists. */
export class UserNotFound extends DomainError {
  constructor() {
    super('USER_NOT_FOUND', 404, 'User not found');
  }
}

/** A passwordless guest identity has no current password to prove. */
export class PasswordNotSet extends DomainError {
  constructor() {
    super('PASSWORD_NOT_SET', 409, 'This account has no password yet');
  }
}

/**
 * Distinct from INVALID_CREDENTIALS: the caller is already authenticated, so
 * this is a field-level rejection of the "current password" input, not a
 * failed sign-in.
 */
export class InvalidCurrentPassword extends DomainError {
  constructor() {
    super('INVALID_CURRENT_PASSWORD', 400, 'The current password is incorrect');
  }
}

export class PasswordUnchanged extends DomainError {
  constructor() {
    super('PASSWORD_UNCHANGED', 400, 'The new password must differ from the current one');
  }
}

export class ChallengeExpired extends DomainError {
  constructor() {
    super('CHALLENGE_EXPIRED', 410, 'The verification request has expired');
  }
}

export class MissingRefreshToken extends DomainError {
  constructor() {
    super('NO_REFRESH_TOKEN', 401, 'Missing refresh token');
  }
}

export class InvalidRefreshToken extends DomainError {
  constructor() {
    super('INVALID_REFRESH_TOKEN', 401, 'Refresh token is invalid or expired');
  }
}
