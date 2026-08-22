import { describe, expect, it } from 'vitest';
import type { LoginInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount, type UserAccountState } from '../../domain/entities/user-account.entity';
import {
  AccountSuspended,
  AuthRateLimited,
  InvalidCredentials,
} from '../../domain/errors/identity-access-errors';
import type { ILoginAbuseProtection } from '../../domain/ports/login-abuse-protection.port';
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
  rateLimited?: boolean;
}

function harness(options: Options = {}) {
  const created: Array<{ userId: string; meta: unknown }> = [];
  const verified: Array<{ hash: string; plain: string }> = [];
  const prechecks: Array<{ normalizedEmail: string; clientIp: string }> = [];
  const failures: Array<{ normalizedEmail: string; clientIp: string }> = [];
  const clearedPairs: Array<{ normalizedEmail: string; clientIp: string }> = [];

  return {
    useCase: new LoginUseCase(
      fakePort<IUserRepository>({
        findByEmail: () =>
          Promise.resolve(options.user === undefined ? account() : options.user),
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
      fakePort<ILoginAbuseProtection>({
        precheck: (req) => {
          prechecks.push(req);
          return Promise.resolve(
            options.rateLimited
              ? {
                  limitedScope: 'ip',
                  retryAfterSeconds: 60,
                  identifiers: { ipId: 'ip-1', accountId: 'acc-1', pairId: 'pair-1' },
                }
              : {
                  limitedScope: null,
                  identifiers: { ipId: 'ip-1', accountId: 'acc-1', pairId: 'pair-1' },
                },
          );
        },
        recordFailure: (req) => {
          failures.push(req);
          return Promise.resolve({
            identifiers: { ipId: 'ip-1', accountId: 'acc-1', pairId: 'pair-1' },
            limitedScope: null,
            distributedAttack: null,
            observationUnavailable: false,
          });
        },
        clearPair: (req) => {
          clearedPairs.push(req);
          return Promise.resolve();
        },
      }),
    ),
    created,
    verified,
    prechecks,
    failures,
    clearedPairs,
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
    const { useCase, verified, failures } = harness({ user: null });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(verified).toEqual([]);
    expect(failures).toHaveLength(1);
  });

  it('refuses when rate limited during precheck', async () => {
    const { useCase, verified } = harness({ rateLimited: true });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(AuthRateLimited);
    expect(verified).toEqual([]);
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

  it('records failure when password was wrong', async () => {
    const { useCase, failures } = harness({ passwordValid: false });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(failures).toHaveLength(1);
  });

  it('issues NO session when the password was wrong', async () => {
    const { useCase, created } = harness({ passwordValid: false });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(created).toEqual([]);
  });

  it('clears the rate limit pair on a successful login', async () => {
    const { useCase, clearedPairs } = harness();

    await useCase.execute(input(), META);

    expect(clearedPairs).toHaveLength(1);
  });

  it('opens the session for the matched user and records the request metadata', async () => {
    // The ip/user-agent are what the account's device list shows.
    const { useCase, created } = harness();

    const result = await useCase.execute(input(), META);

    expect(created).toEqual([{ userId: USER_ID, meta: META }]);
    expect(result.tokens).toBe(TOKENS);
  });

  it('returns the user record on successful login', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(input(), META);

    expect(result.user).toMatchObject({ id: USER_ID, email: EMAIL });
  });
});
