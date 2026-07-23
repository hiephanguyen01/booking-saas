import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * UserAccount-owned domain errors. Code, status, and message are frozen to the
 * pre-refactor HTTP contract.
 *
 * Challenge errors with top-level response fields and refresh/session errors
 * deliberately remain at their existing application/infrastructure boundaries.
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
