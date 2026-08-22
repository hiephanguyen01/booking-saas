import { describe, expect, it } from 'vitest';
import type { RegisterInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount, type NewUserAccount } from '../../domain/entities/user-account.entity';
import { EmailTaken } from '../../domain/errors/identity-access-errors';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type { ISessionStore, SessionTokens } from '../../domain/ports/session-store.port';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { RegisterUseCase } from './register.use-case';

const TOKENS: SessionTokens = {
  sessionId: 'session-1',
  accessToken: 'sid',
  accessExpiresAt: new Date('2026-08-19T12:00:00Z'),
  refreshToken: 'rid',
  refreshExpiresAt: new Date('2026-09-19T12:00:00Z'),
};

function harness(options: { emailTaken?: boolean } = {}) {
  const created: NewUserAccount[] = [];
  const hashed: string[] = [];
  const sessions: Array<{ userId: string; meta: unknown }> = [];
  return {
    useCase: new RegisterUseCase(
      fakePort<IUserRepository>({
        findByEmail: () =>
          Promise.resolve(
            options.emailTaken
              ? UserAccount.rehydrate({ id: 'user-0' } as never)
              : null,
          ),
        create: (data) => {
          created.push(data);
          return Promise.resolve({ id: 'user-1', ...data } as unknown as UserRecord);
        },
      }),
      fakePort<IPasswordHasher>({
        hash: (plain) => {
          hashed.push(plain);
          return Promise.resolve(`hashed:${plain}`);
        },
      }),
      fakePort<ISessionStore>({
        create: (userId, meta) => {
          sessions.push({ userId, meta });
          return Promise.resolve(TOKENS);
        },
      }),
    ),
    created,
    hashed,
    sessions,
  };
}

const input = (overrides: Partial<RegisterInput> = {}) =>
  ({
    email: 'khach@studiohub.vn',
    password: 'demo-password',
    fullName: 'Khách Mới',
    locale: 'vi',
    ...overrides,
  }) as RegisterInput;

const META = { ip: '203.0.113.9', userAgent: 'Firefox' };

describe('RegisterUseCase', () => {
  it('refuses an email that already has an account', async () => {
    const { useCase, created } = harness({ emailTaken: true });

    await expect(useCase.execute(input(), META)).rejects.toBeInstanceOf(EmailTaken);
    expect(created).toEqual([]);
  });

  it('NEVER stores the plaintext password', async () => {
    const { useCase, created, hashed } = harness();

    await useCase.execute(input({ password: 'demo-password' }), META);

    expect(hashed).toEqual(['demo-password']);
    expect(created[0]?.passwordHash).toBe('hashed:demo-password');
  });

  it('leaves the email UNVERIFIED on this legacy path', async () => {
    // The OTP flow is what proves an address; this endpoint never saw one, so
    // claiming verification here would forge it.
    const { useCase, created } = harness();

    await useCase.execute(input(), META);

    expect(created[0]?.emailVerifiedAt).toBeNull();
  });

  it('creates an active account with the submitted profile', async () => {
    const { useCase, created } = harness();

    await useCase.execute(input({ fullName: 'Khách Mới', phone: '0900000000', locale: 'en' }), META);

    expect(created[0]).toMatchObject({
      email: 'khach@studiohub.vn',
      fullName: 'Khách Mới',
      phone: '0900000000',
      locale: 'en',
      status: 'active',
      failedLoginCount: 0,
      lockedUntil: null,
      avatarUrl: null,
    });
  });

  it('defaults an omitted phone to null rather than leaving it undefined', async () => {
    const { useCase, created } = harness();

    await useCase.execute(input(), META);

    expect(created[0]?.phone).toBeNull();
  });

  it('signs the new account in, on the id persistence assigned', async () => {
    const { useCase, sessions } = harness();

    const result = await useCase.execute(input(), META);

    expect(sessions).toEqual([{ userId: 'user-1', meta: META }]);
    expect(result.tokens).toBe(TOKENS);
    expect(result.user).toMatchObject({ id: 'user-1' });
  });
});
