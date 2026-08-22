import { describe, expect, it } from 'vitest';
import type { LoginInput } from '@booking/contracts';
import { fakePort } from '~testing';
import {
  LOGIN_LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  UserAccount,
  type LoginLockoutIntent,
  type UserAccountState,
} from '../../domain/entities/user-account.entity';
import {
  AccountLocked,
  AccountSuspended,
  InvalidCredentials,
} from '../../domain/errors/identity-access-errors';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type { ISessionStore, SessionTokens } from '../../domain/ports/session-store.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { LoginUseCase } from './login.use-case';

const USER_ID = 'user-1';
const EMAIL = 'owner@studiohub.vn';
const HASH = 'argon2-hash';

const TOKENS: SessionTokens = {
  sessionId: 'session-1',
  accessToken: 'sid-token',
  accessExpiresAt: new Date('2026-08-19T12:00:00Z'),
  refreshToken: 'rid-token',
  refreshExpiresAt: new Date('2026-09-19T12:00:00Z'),
};

const account = (overrides: Partial<UserAccountState> = {}): UserAccount =>
  UserAccount.rehydrate({
    id: USER_ID,
    email: EMAIL,
    passwordHash: HASH,
    fullName: 'Chủ StudioHub',
    phone: null,
    avatarUrl: null,
    locale: 'vi',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

interface Options {
  user?: UserAccount | null;
  passwordValid?: boolean;
}

function harness(options: Options = {}) {
  const lockoutWrites: Array<{ userId: string; intent: LoginLockoutIntent }> = [];
  const created: Array<{ userId: string; meta: unknown }> = [];
  const verified: Array<{ hash: string; plain: string }> = [];
  return {
    useCase: new LoginUseCase(
      fakePort<IUserRepository>({
        findByEmail: () =>
          Promise.resolve(options.user === undefined ? account() : options.user),
        updateLockout: (userId, intent) => {
          lockoutWrites.push({ userId, intent });
          return Promise.resolve();
        },
      }),
      fakePort<IPasswordHasher>({
        verify: (hash, plain) => {
          verified.push({ hash, plain });
          return Promise.resolve(options.passwordValid ?? true);
        },
      }),
      fakePort<ISessionStore>({
        create: (userId, meta) => {
          created.push({ userId, meta });
          return Promise.resolve(TOKENS);
        },
      }),
    ),
    lockoutWrites,
    created,
    verified,
  };
}

const input = (overrides: Partial<LoginInput> = {}) =>
  ({ email: EMAIL, password: 'demo-password', ...overrides }) as LoginInput;

const META = { ip: '203.0.113.9', userAgent: 'Firefox' };

describe('LoginUseCase', () => {
  it('answers the SAME error for an unknown email as for a wrong password', async () => {
    // Two different errors here would turn the login form into an account
    // enumeration oracle.
    const unknown = harness({ user: null });
    const wrongPassword = harness({ passwordValid: false });

    const a = await unknown.useCase.execute(input(), META).catch((error: unknown) => error);
    const b = await wrongPassword.useCase.execute(input(), META).catch((error: unknown) => error);

    expect(a).toBeInstanceOf(InvalidCredentials);
    expect(b).toBeInstanceOf(InvalidCredentials);
    expect((a as Error).message).toBe((b as Error).message);
  });

  it('does not hash-verify anything for an unknown email', async () => {
    const { useCase, verified } = harness({ user: null });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(verified).toEqual([]);
  });

  it('refuses a locked account before it looks at the password', async () => {
    // Verifying first would let an attacker keep testing passwords against a
    // locked account, which is the whole point of the lock.
    const { useCase, verified } = harness({
      user: account({ lockedUntil: new Date(Date.now() + 60_000) }),
    });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(AccountLocked);
    expect(verified).toEqual([]);
  });

  it('lets an EXPIRED lock through', async () => {
    const { useCase, created } = harness({
      user: account({ lockedUntil: new Date(Date.now() - 60_000) }),
    });

    await useCase.execute(input(), META);

    expect(created).toHaveLength(1);
  });

  it('refuses a suspended account', async () => {
    const { useCase, verified } = harness({ user: account({ status: 'suspended' }) });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(AccountSuspended);
    expect(verified).toEqual([]);
  });

  it('refuses a guest identity, which has no password to log in with', async () => {
    const { useCase, verified } = harness({ user: account({ passwordHash: null }) });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(verified).toEqual([]);
  });

  it("verifies the plaintext against the stored account's hash", async () => {
    const { useCase, verified } = harness();

    await useCase.execute(input({ password: 'demo-password' }), META);

    expect(verified).toEqual([{ hash: HASH, plain: 'demo-password' }]);
  });

  it('COUNTS a failed attempt so the lockout can ever trigger', async () => {
    const { useCase, lockoutWrites } = harness({
      passwordValid: false,
      user: account({ failedLoginCount: 1 }),
    });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);

    expect(lockoutWrites).toEqual([
      { userId: USER_ID, intent: { failedLoginCount: 2, lockedUntil: null } },
    ]);
  });

  it('locks the account on the fifth consecutive failure', async () => {
    const { useCase, lockoutWrites } = harness({
      passwordValid: false,
      user: account({ failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS - 1 }),
    });
    const before = Date.now();

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);

    const intent = lockoutWrites[0]?.intent;
    expect(intent?.failedLoginCount).toBe(0);
    const lockedUntil = intent?.lockedUntil?.getTime() ?? 0;
    expect(lockedUntil).toBeGreaterThanOrEqual(before + LOGIN_LOCKOUT_MINUTES * 60_000);
    expect(lockedUntil).toBeLessThanOrEqual(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000);
  });

  it('issues NO session when the password was wrong', async () => {
    const { useCase, created } = harness({ passwordValid: false });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(created).toEqual([]);
  });

  it('clears the failure counter on a successful login', async () => {
    // Otherwise four old failures plus one much later would lock an account
    // whose owner simply mistyped once a month.
    const { useCase, lockoutWrites } = harness({ user: account({ failedLoginCount: 4 }) });

    await useCase.execute(input(), META);

    expect(lockoutWrites).toEqual([
      { userId: USER_ID, intent: { failedLoginCount: 0, lockedUntil: null } },
    ]);
  });

  it('opens the session for the matched user and records the request metadata', async () => {
    // The ip/user-agent are what the account's device list shows.
    const { useCase, created } = harness();

    const result = await useCase.execute(input(), META);

    expect(created).toEqual([{ userId: USER_ID, meta: META }]);
    expect(result.tokens).toBe(TOKENS);
  });

  it('returns the user as it was BEFORE the counter reset was applied', async () => {
    // The record is mapped before `recordLoginSuccess` mutates the aggregate, so
    // the response reflects the row the caller authenticated against.
    const { useCase } = harness({ user: account({ failedLoginCount: 3 }) });

    const result = await useCase.execute(input(), META);

    expect(result.user).toMatchObject({ id: USER_ID, email: EMAIL, failedLoginCount: 3 });
  });
});
