import { describe, expect, it } from 'vitest';
import type { AuthPasswordCompleteInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount, type UserAccountState } from '../../domain/entities/user-account.entity';
import {
  ChallengeExpired,
  EmailRegisteredForGuestUpgrade,
  GuestNotFound,
} from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type {
  IRegistrationCompletionRepository,
  RegistrationGuestUpgradeInput,
} from '../../domain/ports/registration-completion-repository.port';
import type { ISessionStore, SessionTokens } from '../../domain/ports/session-store.port';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { UpgradeGuestUseCase } from './upgrade-guest.use-case';

const TOKENS: SessionTokens = {
  sessionId: 'session-1',
  accessToken: 'sid',
  accessExpiresAt: new Date('2026-08-19T12:00:00Z'),
  refreshToken: 'rid',
  refreshExpiresAt: new Date('2026-09-19T12:00:00Z'),
};

const guest = (overrides: Partial<UserAccountState> = {}): UserAccount =>
  UserAccount.rehydrate({
    id: 'user-guest',
    email: 'khach@studiohub.vn',
    passwordHash: null,
    fullName: 'Khách Lẻ',
    phone: '0900000000',
    avatarUrl: null,
    locale: 'vi',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    ...overrides,
  });

const challenge = (overrides: Partial<AuthChallengePayload> = {}): AuthChallengePayload => ({
  purpose: 'registration',
  email: 'khach@studiohub.vn',
  fullName: 'Khách Lẻ',
  locale: 'vi',
  userId: 'user-guest',
  ...overrides,
});

interface Options {
  payload?: AuthChallengePayload | null;
  existing?: UserAccount | null;
  conflict?: boolean;
}

function harness(options: Options = {}) {
  const currentPayload = options.payload === undefined ? challenge() : options.payload;
  const existing = options.existing === undefined ? guest() : options.existing;
  const hashed: string[] = [];
  const upgraded: RegistrationGuestUpgradeInput[] = [];
  const consumed: Array<{ token: string; purpose: AuthChallengePurpose }> = [];
  const sessions: Array<{ userId: string; meta: unknown }> = [];
  const upgradedUser = {
    id: 'user-guest',
    email: 'khach@studiohub.vn',
    passwordHash: 'hashed:demo-password',
    fullName: 'Khách Lẻ',
    phone: '0900000000',
    avatarUrl: null,
    locale: 'vi',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    emailVerifiedAt: new Date('2026-09-06T12:00:00Z'),
  } satisfies UserRecord;

  return {
    useCase: new UpgradeGuestUseCase(
      fakePort<IAuthChallengeStore>({
        peekCompletion: () => Promise.resolve(currentPayload),
        consumeCompletion: (token, purpose) => {
          consumed.push({ token, purpose });
          return Promise.resolve(currentPayload);
        },
      }),
      fakePort<IUserRepository>({ findByEmail: () => Promise.resolve(existing) }),
      fakePort<IPasswordHasher>({
        hash: (plain) => {
          hashed.push(plain);
          return Promise.resolve(`hashed:${plain}`);
        },
      }),
      fakePort<IRegistrationCompletionRepository>({
        upgradeGuest: (upgradeInput) => {
          upgraded.push(upgradeInput);
          return Promise.resolve(
            options.conflict
              ? { status: 'conflict' }
              : { status: 'upgraded', user: upgradedUser },
          );
        },
      }),
      fakePort<ISessionStore>({
        create: (userId, meta) => {
          sessions.push({ userId, meta });
          return Promise.resolve(TOKENS);
        },
      }),
    ),
    consumed,
    hashed,
    sessions,
    upgraded,
  };
}

const input = {
  completionToken: 'completion-token-from-email-otp',
  password: 'demo-password',
} as AuthPasswordCompleteInput;
const META = { ip: '203.0.113.9', userAgent: 'Firefox' };

describe('UpgradeGuestUseCase', () => {
  it('refuses a missing, expired, or non-registration completion token', async () => {
    const { useCase, upgraded, sessions } = harness({ payload: null });

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(ChallengeExpired);
    expect(upgraded).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it('refuses a registration token that was not issued for a specific guest row', async () => {
    const { useCase, upgraded } = harness({ payload: challenge({ userId: undefined }) });

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(ChallengeExpired);
    expect(upgraded).toEqual([]);
  });

  it('refuses when the OTP-bound email now belongs to a password account', async () => {
    const { useCase, upgraded } = harness({
      existing: guest({ passwordHash: 'argon2-hash' }),
    });

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(
      EmailRegisteredForGuestUpgrade,
    );
    expect(upgraded).toEqual([]);
  });

  it('refuses when the OTP-bound guest row no longer exists', async () => {
    const { useCase, hashed } = harness({ existing: null });

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(GuestNotFound);
    expect(hashed).toEqual([]);
  });

  it('refuses when the challenge user id does not match the current email owner', async () => {
    const { useCase, upgraded } = harness({ existing: guest({ id: 'user-other' }) });

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(ChallengeExpired);
    expect(upgraded).toEqual([]);
  });

  it('uses the verified challenge identity, upgrades by CAS, consumes the token, and signs in', async () => {
    const { useCase, upgraded, consumed, sessions } = harness({
      payload: challenge({
        tenantId: 'tenant-1',
        acceptedVersionIds: ['doc-v1'],
        acceptedLocale: 'en',
      }),
    });

    const result = await useCase.execute(input, META);

    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]).toMatchObject({
      userId: 'user-guest',
      email: 'khach@studiohub.vn',
      passwordHash: 'hashed:demo-password',
      consent: {
        tenantId: 'tenant-1',
        acceptedVersionIds: ['doc-v1'],
        acceptedLocale: 'en',
        ip: '203.0.113.9',
      },
    });
    expect(upgraded[0]?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(consumed).toEqual([
      { token: 'completion-token-from-email-otp', purpose: 'registration' },
    ]);
    expect(sessions).toEqual([{ userId: 'user-guest', meta: META }]);
    expect(result.tokens).toBe(TOKENS);
  });

  it('does not create a session when the password CAS loses a race', async () => {
    const { useCase, sessions, consumed } = harness({ conflict: true });

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(
      EmailRegisteredForGuestUpgrade,
    );
    expect(sessions).toEqual([]);
    expect(consumed).toEqual([]);
  });
});
