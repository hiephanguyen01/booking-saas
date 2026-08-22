import { describe, expect, it } from 'vitest';
import type { UpgradeGuestInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount, type UserAccountState } from '../../domain/entities/user-account.entity';
import {
  EmailRegisteredForGuestUpgrade,
  GuestNotFound,
} from '../../domain/errors/identity-access-errors';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
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

const account = (overrides: Partial<UserAccountState> = {}): UserAccount =>
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

function harness(existing: UserAccount | null = account()) {
  const written: Array<{ userId: string; passwordHash: string }> = [];
  const sessions: Array<{ userId: string; meta: unknown }> = [];
  return {
    useCase: new UpgradeGuestUseCase(
      fakePort<IUserRepository>({
        findByEmail: () => Promise.resolve(existing),
        setPassword: (userId, passwordHash) => {
          written.push({ userId, passwordHash });
          return Promise.resolve({ id: userId, passwordHash } as UserRecord);
        },
      }),
      fakePort<IPasswordHasher>({ hash: (plain) => Promise.resolve(`hashed:${plain}`) }),
      fakePort<ISessionStore>({
        create: (userId, meta) => {
          sessions.push({ userId, meta });
          return Promise.resolve(TOKENS);
        },
      }),
    ),
    written,
    sessions,
  };
}

const input = { email: 'khach@studiohub.vn', password: 'demo-password' } as UpgradeGuestInput;
const META = { ip: '203.0.113.9', userAgent: 'Firefox' };

describe('UpgradeGuestUseCase', () => {
  it('REFUSES to set a password on an email that already owns an account', async () => {
    // This endpoint is unauthenticated; without the guard it would be a
    // password-reset with no proof of ownership at all.
    const { useCase, written } = harness(account({ passwordHash: 'argon2-hash' }));

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(
      EmailRegisteredForGuestUpgrade,
    );
    expect(written).toEqual([]);
  });

  it('tells an unknown address apart from an already-registered one', async () => {
    // Two distinct errors on purpose: the screens differ — one offers to
    // register, the other to sign in.
    const { useCase } = harness(null);

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(GuestNotFound);
  });

  it('hashes only AFTER the eligibility check', async () => {
    // Hashing is deliberately slow; doing it first would make the refusal path
    // as expensive as the success path.
    const hashed: string[] = [];
    const useCase = new UpgradeGuestUseCase(
      fakePort<IUserRepository>({ findByEmail: () => Promise.resolve(null) }),
      fakePort<IPasswordHasher>({
        hash: (plain) => {
          hashed.push(plain);
          return Promise.resolve('hashed');
        },
      }),
      fakePort<ISessionStore>({}),
    );

    await expect(useCase.execute(input, META)).rejects.toBeInstanceOf(GuestNotFound);
    expect(hashed).toEqual([]);
  });

  it('stores the hash against the guest row and signs them in', async () => {
    const { useCase, written, sessions } = harness();

    const result = await useCase.execute(input, META);

    expect(written).toEqual([{ userId: 'user-guest', passwordHash: 'hashed:demo-password' }]);
    expect(sessions).toEqual([{ userId: 'user-guest', meta: META }]);
    expect(result.tokens).toBe(TOKENS);
  });
});
