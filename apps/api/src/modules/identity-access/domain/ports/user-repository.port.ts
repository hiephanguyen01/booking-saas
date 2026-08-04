import type {
  LoginLockoutIntent,
  NewUserAccount,
  ProfileIntent,
  UserAccount,
} from '../entities/user-account.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRecord {
  id: string;
  email: string;
  /** Null for guest-checkout users (§8.6) — they have no password to log in with. */
  passwordHash: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
  status: 'active' | 'suspended';
  failedLoginCount: number;
  lockedUntil: Date | null;
  emailVerifiedAt: Date | null;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  findById(userId: string): Promise<UserAccount | null>;
  create(data: NewUserAccount): Promise<UserRecord>;
  /** Set a guest's password hash — the upgrade-to-account step (§8.6). */
  setPassword(userId: string, passwordHash: string): Promise<UserRecord>;
  /** Self-service profile write; the intent already carries every resolved column. */
  updateProfile(userId: string, intent: ProfileIntent): Promise<UserRecord>;
  updateLockout(userId: string, intent: LoginLockoutIntent): Promise<void>;
}
