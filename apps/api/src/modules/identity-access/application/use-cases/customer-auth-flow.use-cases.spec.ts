import { describe, expect, it, vi } from 'vitest';
import type { IAuthChallengeStore } from '../../domain/ports/auth-challenge-store.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type { ISessionStore } from '../../domain/ports/session-store.port';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import {
  CompletePasswordResetUseCase,
  CompleteRegistrationUseCase,
  StartPasswordResetUseCase,
} from './customer-auth-flow.use-cases';

const user: UserRecord = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'old',
  fullName: 'Customer',
  phone: null,
  locale: 'vi',
  status: 'active',
  failedLoginCount: 0,
  lockedUntil: null,
  emailVerifiedAt: new Date(),
};

describe('customer auth flows', () => {
  it('does not disclose whether a reset email exists', async () => {
    const issue = vi.fn(async ({ email }: { email: string }) => ({
      challengeId: 'x'.repeat(32),
      otp: '123456',
      expiresInSec: 600,
      resendAfterSec: 60,
      email,
    }));
    const challenges = { issue } as unknown as IAuthChallengeStore;
    const email = { sendOtp: vi.fn() } as IAuthEmailSender;
    const missingUsers = { findByEmail: vi.fn(async () => null) } as unknown as IUserRepository;
    const existingUsers = { findByEmail: vi.fn(async () => user) } as unknown as IUserRepository;
    const missing = await new StartPasswordResetUseCase(missingUsers, challenges, email).execute({
      email: user.email,
      locale: 'vi',
    });
    const existing = await new StartPasswordResetUseCase(existingUsers, challenges, email).execute({
      email: user.email,
      locale: 'vi',
    });
    expect(missing).toEqual(existing);
    expect(email.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('creates a verified user only after consuming a completion token', async () => {
    const create = vi.fn(async (data) => ({ ...user, ...data }));
    const users = { findByEmail: vi.fn(async () => null), create } as unknown as IUserRepository;
    const challenges = {
      consumeCompletion: vi.fn(async () => ({
        purpose: 'registration',
        email: user.email,
        fullName: user.fullName,
        locale: 'vi',
      })),
    } as unknown as IAuthChallengeStore;
    const hasher = { hash: vi.fn(async () => 'new-hash') } as unknown as IPasswordHasher;
    await new CompleteRegistrationUseCase(challenges, users, hasher).execute({
      completionToken: 'x'.repeat(32),
      password: 'Password1',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: expect.any(Date), passwordHash: 'new-hash' }),
    );
  });

  it('revokes every active session after changing the password', async () => {
    const users = { setPassword: vi.fn(async () => user) } as unknown as IUserRepository;
    const challenges = {
      consumeCompletion: vi.fn(async () => ({
        purpose: 'password_reset',
        email: user.email,
        locale: 'vi',
        userId: user.id,
      })),
    } as unknown as IAuthChallengeStore;
    const hasher = { hash: vi.fn(async () => 'new-hash') } as unknown as IPasswordHasher;
    const sessions = { revokeAllForUser: vi.fn(async () => undefined) } as unknown as ISessionStore;
    await new CompletePasswordResetUseCase(challenges, users, hasher, sessions).execute({
      completionToken: 'x'.repeat(32),
      password: 'Password1',
    });
    expect(users.setPassword).toHaveBeenCalledWith(user.id, 'new-hash');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(user.id);
  });
});
