import type { Locale } from '@booking/contracts';
import type { NewUserAccount } from '../entities/user-account.entity';
import type { UserRecord } from './user-repository.port';

export const REGISTRATION_COMPLETION_REPOSITORY = Symbol('REGISTRATION_COMPLETION_REPOSITORY');

export interface RegistrationConsentEventInput {
  tenantId: string;
  userId: string;
  acceptedVersionIds: readonly string[];
  acceptedLocale: Locale;
  ip: string | null;
}

export interface RegistrationCompletionInput {
  user: NewUserAccount;
  consent?: Omit<RegistrationConsentEventInput, 'userId'>;
}

export type RegistrationCompletionCreateResult =
  | { status: 'created'; user: UserRecord }
  | { status: 'email_conflict' };

export interface RegistrationGuestUpgradeInput {
  userId: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  consent?: Omit<RegistrationConsentEventInput, 'userId'>;
}

export type RegistrationGuestUpgradeResult =
  | { status: 'upgraded'; user: UserRecord }
  | { status: 'conflict' };

export interface IRegistrationCompletionRepository {
  create(input: RegistrationCompletionInput): Promise<RegistrationCompletionCreateResult>;
  upgradeGuest(input: RegistrationGuestUpgradeInput): Promise<RegistrationGuestUpgradeResult>;
  emitConsent(input: RegistrationConsentEventInput): Promise<void>;
}
