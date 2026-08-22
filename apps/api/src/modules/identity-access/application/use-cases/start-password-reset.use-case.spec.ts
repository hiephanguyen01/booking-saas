import { describe, expect, it } from 'vitest';
import type { PasswordResetStartInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount, type UserAccountState } from '../../domain/entities/user-account.entity';
import type {
  AuthChallengePayload,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { StartPasswordResetUseCase } from './start-password-reset.use-case';

const CHALLENGE = {
  challengeId: 'challenge-1',
  otp: '123456',
  expiresInSec: 600,
  resendAfterSec: 60,
};

const account = (overrides: Partial<UserAccountState> = {}): UserAccount =>
  UserAccount.rehydrate({
    id: 'user-1',
    email: 'khach@studiohub.vn',
    passwordHash: 'argon2-hash',
    fullName: 'Khách Cũ',
    phone: null,
    avatarUrl: null,
    locale: 'vi',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    ...overrides,
  });

function harness(user: UserAccount | null = account()) {
  const issued: AuthChallengePayload[] = [];
  const sent: Array<Record<string, unknown>> = [];
  return {
    useCase: new StartPasswordResetUseCase(
      fakePort<IUserRepository>({ findByEmail: () => Promise.resolve(user) }),
      fakePort<IAuthChallengeStore>({
        issue: (payload) => {
          issued.push(payload);
          return Promise.resolve(CHALLENGE);
        },
      }),
      fakePort<IAuthEmailSender>({
        sendOtp: (args) => {
          sent.push(args as unknown as Record<string, unknown>);
          return Promise.resolve();
        },
      }),
    ),
    issued,
    sent,
  };
}

const input = (overrides: Partial<PasswordResetStartInput> = {}) =>
  ({ email: 'khach@studiohub.vn', locale: 'vi', ...overrides }) as PasswordResetStartInput;

describe('StartPasswordResetUseCase', () => {
  it('answers IDENTICALLY for an unknown address as for a real one', async () => {
    // "Reset your password" is an unauthenticated endpoint; a different response
    // for an unknown address would turn it into an account-existence oracle.
    const real = await harness().useCase.execute(input());
    const unknown = await harness(null).useCase.execute(input());

    expect(unknown).toEqual(real);
  });

  it('issues a decoy challenge for an unknown address so even the timing matches', async () => {
    const { useCase, issued } = harness(null);

    await useCase.execute(input());

    expect(issued).toHaveLength(1);
    expect(issued[0]).not.toHaveProperty('userId');
  });

  it('sends NO email to an address with no account', async () => {
    const { useCase, sent } = harness(null);

    await useCase.execute(input());

    expect(sent).toEqual([]);
  });

  it('sends no email to a guest identity, which has no password to reset', async () => {
    // A guest-checkout row exists but has never had a password; a reset link
    // would be meaningless and would confirm the address is on file.
    const { useCase, sent, issued } = harness(account({ passwordHash: null }));

    await useCase.execute(input());

    expect(sent).toEqual([]);
    expect(issued[0]).not.toHaveProperty('userId');
  });

  it('binds the challenge to the user id so the completion knows whose password to set', async () => {
    const { useCase, issued } = harness();

    await useCase.execute(input({ tenantId: 'tenant-1' }));

    expect(issued).toEqual([
      {
        purpose: 'password_reset',
        email: 'khach@studiohub.vn',
        locale: 'vi',
        tenantId: 'tenant-1',
        userId: 'user-1',
        fullName: 'Khách Cũ',
      },
    ]);
  });

  it('emails the code with the tenant branding the request came from', async () => {
    const { useCase, sent } = harness();

    await useCase.execute(input({ tenantId: 'tenant-1' }));

    expect(sent).toEqual([
      {
        purpose: 'password_reset',
        email: 'khach@studiohub.vn',
        fullName: 'Khách Cũ',
        locale: 'vi',
        otp: '123456',
        expiresInSec: 600,
        challengeId: 'challenge-1',
        tenantId: 'tenant-1',
      },
    ]);
  });

  it('masks the destination and never returns the code', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(input());

    expect(result).toEqual({
      challengeId: 'challenge-1',
      maskedDestination: 'kh***@studiohub.vn',
      expiresInSec: 600,
      resendAfterSec: 60,
    });
  });
});
