import type { LockoutState } from '../login-lockout';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRecord {
  id: string;
  email: string;
  /** Null for guest-checkout users (§8.6) — they have no password to log in with. */
  passwordHash: string | null;
  fullName: string;
  phone: string | null;
  locale: string;
  status: 'active' | 'suspended';
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  locale: string;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: CreateUserData): Promise<UserRecord>;
  updateLockout(userId: string, state: LockoutState): Promise<void>;
}
