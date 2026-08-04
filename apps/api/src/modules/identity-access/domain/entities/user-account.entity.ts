import { addMinutes } from '../../../../shared/time/time';
import {
  AccountLocked,
  AccountSuspended,
  EmailRegisteredForGuestBooking,
  EmailRegisteredForGuestUpgrade,
  EmailTaken,
  GuestNotFound,
  InvalidCredentials,
  PasswordNotSet,
} from '../errors/identity-access-errors';

export type UserAccountStatus = 'active' | 'suspended';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

/** Narrow persisted state owned by UserAccount. */
export interface UserAccountState {
  id: string;
  email: string;
  /** Null identifies a passwordless guest-checkout identity. */
  passwordHash: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
  status: UserAccountStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
  emailVerifiedAt: Date | null;
}

/** Validated create intent; id and timestamps are assigned by persistence. */
export interface NewUserAccount {
  email: string;
  passwordHash: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
  status: 'active';
  failedLoginCount: 0;
  lockedUntil: null;
  emailVerifiedAt: Date | null;
}

/** Column-granular lockout write produced after a login attempt. */
export interface LoginLockoutIntent {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/** Column-granular password write. Plaintext never enters this intent. */
export interface PasswordHashIntent {
  passwordHash: string;
}

/** Column-granular self-service profile write. Email and locale are not editable here. */
export interface ProfileIntent {
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
}

/**
 * A global user identity: password account or passwordless checkout guest.
 *
 * Framework-free and clock-injected. Hash generation/comparison, persistence,
 * session revocation, and email uniqueness concurrency remain outside.
 */
export class UserAccount {
  private constructor(private state: UserAccountState) {}

  /** Shallow-copy persisted state without validating or normalizing legacy rows. */
  static rehydrate(state: UserAccountState): UserAccount {
    return new UserAccount({ ...state });
  }

  /**
   * Build a password account. Callers choose the existing flow's verification
   * timestamp: null for legacy /register, app-clock Date for verified completion.
   */
  static register(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string | null;
    locale: string;
    emailVerifiedAt: Date | null;
  }): NewUserAccount {
    return {
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      avatarUrl: null,
      locale: input.locale,
      status: 'active',
      failedLoginCount: 0,
      lockedUntil: null,
      emailVerifiedAt: input.emailVerifiedAt,
    };
  }

  /** Build the exact defaults for a passwordless guest-checkout identity. */
  static createGuest(input: { email: string; fullName: string; phone: string }): NewUserAccount {
    return {
      email: input.email,
      passwordHash: null,
      fullName: input.fullName,
      phone: input.phone,
      avatarUrl: null,
      locale: 'vi',
      status: 'active',
      failedLoginCount: 0,
      lockedUntil: null,
      emailVerifiedAt: null,
    };
  }

  /** Prepare password-reset persistence without loading account state. */
  static resetPasswordHash(nextPasswordHash: string): PasswordHashIntent {
    return { passwordHash: nextPasswordHash };
  }

  /** Domain-side availability pre-check; the citext unique index remains final. */
  static assertEmailAvailable(existing: UserAccount | null): void {
    if (existing) throw new EmailTaken();
  }

  /**
   * Existing passwordless guests are reusable for another checkout. A password
   * account gets the booking-specific EMAIL_REGISTERED message.
   */
  static reuseGuest(existing: UserAccount | null): UserAccount | null {
    if (!existing) return null;
    if (existing.state.passwordHash !== null) {
      throw new EmailRegisteredForGuestBooking();
    }
    return existing;
  }

  /**
   * Select the only identity eligible for guest upgrade before hashing begins.
   * Missing and already-registered identities intentionally use distinct errors.
   */
  static requireGuestForUpgrade(existing: UserAccount | null): UserAccount {
    if (!existing) throw new GuestNotFound();
    if (existing.state.passwordHash !== null) {
      throw new EmailRegisteredForGuestUpgrade();
    }
    return existing;
  }

  get id(): string {
    return this.state.id;
  }

  get email(): string {
    return this.state.email;
  }

  get passwordHash(): string | null {
    return this.state.passwordHash;
  }

  get fullName(): string {
    return this.state.fullName;
  }

  get phone(): string | null {
    return this.state.phone;
  }

  get avatarUrl(): string | null {
    return this.state.avatarUrl;
  }

  get locale(): string {
    return this.state.locale;
  }

  get status(): UserAccountStatus {
    return this.state.status;
  }

  get failedLoginCount(): number {
    return this.state.failedLoginCount;
  }

  get lockedUntil(): Date | null {
    return this.state.lockedUntil;
  }

  get emailVerifiedAt(): Date | null {
    return this.state.emailVerifiedAt;
  }

  /**
   * Password-login gates in frozen order: active lockout, suspended status,
   * then passwordless guest. Expiry is strict: lockedUntil === now is allowed.
   */
  assertCanPasswordLogin(now: Date): string {
    if (this.state.lockedUntil !== null && this.state.lockedUntil > now) {
      throw new AccountLocked();
    }
    if (this.state.status !== 'active') throw new AccountSuspended();
    if (this.state.passwordHash === null) throw new InvalidCredentials();
    return this.state.passwordHash;
  }

  /**
   * Attempts 1–4 increment and clear any expired lock. Attempt five locks for
   * exactly fifteen minutes and resets the persisted counter to zero.
   */
  recordLoginFailure(now: Date): LoginLockoutIntent {
    const failedLoginCount = this.state.failedLoginCount + 1;
    const intent: LoginLockoutIntent =
      failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS
        ? {
            failedLoginCount: 0,
            // Deterministically derived from the injected app clock.
            lockedUntil: addMinutes(now, LOGIN_LOCKOUT_MINUTES),
          }
        : { failedLoginCount, lockedUntil: null };
    this.state = { ...this.state, ...intent };
    return intent;
  }

  /** Successful password verification always persists a reset, even if unchanged. */
  recordLoginSuccess(): LoginLockoutIntent {
    const intent: LoginLockoutIntent = {
      failedLoginCount: 0,
      lockedUntil: null,
    };
    this.state = { ...this.state, ...intent };
    return intent;
  }

  /**
   * Prepare a column-only password change for guest upgrade. The caller supplies
   * an already-generated hash; plaintext is never modeled.
   */
  changePasswordHash(nextPasswordHash: string): PasswordHashIntent {
    this.state = { ...this.state, passwordHash: nextPasswordHash };
    return { passwordHash: nextPasswordHash };
  }

  /**
   * Self-service profile edit. An omitted key leaves the column as it is, so a
   * card that only submits a name can never blank out the phone or the photo;
   * an explicit null clears the value. Suspended accounts may not edit.
   */
  changeProfile(input: {
    fullName: string;
    phone?: string | null;
    avatarUrl?: string | null;
  }): ProfileIntent {
    if (this.state.status !== 'active') throw new AccountSuspended();
    const intent: ProfileIntent = {
      fullName: input.fullName,
      phone: input.phone === undefined ? this.state.phone : input.phone,
      avatarUrl: input.avatarUrl === undefined ? this.state.avatarUrl : input.avatarUrl,
    };
    this.state = { ...this.state, ...intent };
    return intent;
  }

  /**
   * Gates a signed-in password change and hands back the hash to verify against.
   * A passwordless guest has no current password to prove, so it must go through
   * the upgrade flow instead of this one.
   */
  assertCanChangePassword(): string {
    if (this.state.status !== 'active') throw new AccountSuspended();
    if (this.state.passwordHash === null) throw new PasswordNotSet();
    return this.state.passwordHash;
  }
}
