import { describe, expect, it } from 'vitest';
import type { ChangeMyPasswordInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount, type UserAccountState } from '../../domain/entities/user-account.entity';
import {
  AccountSuspended,
  InvalidCurrentPassword,
  PasswordNotSet,
  PasswordUnchanged,
  UserNotFound,
} from '../../domain/errors/identity-access-errors';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type { ISessionStore } from '../../domain/ports/session-store.port';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { ChangeMyPasswordUseCase } from './change-my-password.use-case';

const CURRENT = 'mat-khau-cu';
const HASH = `hashed:${CURRENT}`;
const PRINCIPAL = { userId: 'user-1', sessionId: 'session-1' };

const account = (overrides: Partial<UserAccountState> = {}): UserAccount =>
  UserAccount.rehydrate({
    id: 'user-1',
    email: 'khach@studiohub.vn',
    passwordHash: HASH,
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
  const written: Array<{ userId: string; passwordHash: string }> = [];
  const revoked: Array<{ userId: string; keepSessionId: string }> = [];
  return {
    useCase: new ChangeMyPasswordUseCase(
      fakePort<IUserRepository>({
        findById: () => Promise.resolve(user),
        setPassword: (userId, passwordHash) => {
          written.push({ userId, passwordHash });
          return Promise.resolve({ id: userId } as UserRecord);
        },
      }),
      // The fake hasher mirrors the production contract: a plaintext matches a
      // hash exactly when the hash is `hashed:<plaintext>`.
      fakePort<IPasswordHasher>({
        hash: (plain) => Promise.resolve(`hashed:${plain}`),
        verify: (hash, plain) => Promise.resolve(hash === `hashed:${plain}`),
      }),
      fakePort<ISessionStore>({
        revokeOtherSessionsForUser: (userId, keepSessionId) => {
          revoked.push({ userId, keepSessionId });
          return Promise.resolve();
        },
      }),
    ),
    written,
    revoked,
  };
}

const input = (overrides: Partial<ChangeMyPasswordInput> = {}) =>
  ({ currentPassword: CURRENT, newPassword: 'mat-khau-moi', ...overrides }) as ChangeMyPasswordInput;

describe('ChangeMyPasswordUseCase', () => {
  it('answers not-found when the session points at a deleted user', async () => {
    const { useCase, written } = harness(null);

    await expect(useCase.execute(PRINCIPAL, input())).rejects.toBeInstanceOf(UserNotFound);
    expect(written).toEqual([]);
  });

  it('refuses a suspended account', async () => {
    const { useCase, written } = harness(account({ status: 'suspended' }));

    await expect(useCase.execute(PRINCIPAL, input())).rejects.toBeInstanceOf(AccountSuspended);
    expect(written).toEqual([]);
  });

  it('refuses a guest identity, which has no current password to prove', async () => {
    const { useCase, written } = harness(account({ passwordHash: null }));

    await expect(useCase.execute(PRINCIPAL, input())).rejects.toBeInstanceOf(PasswordNotSet);
    expect(written).toEqual([]);
  });

  it('PROVES the current password before changing it', async () => {
    // A stolen session alone must not be enough to lock the real owner out.
    const { useCase, written } = harness();

    await expect(
      useCase.execute(PRINCIPAL, input({ currentPassword: 'doan-mo' })),
    ).rejects.toBeInstanceOf(InvalidCurrentPassword);
    expect(written).toEqual([]);
  });

  it('refuses a "new" password identical to the current one', async () => {
    // Re-saving the same secret looks like a rotation in the audit trail while
    // changing nothing.
    const { useCase, written } = harness();

    await expect(
      useCase.execute(PRINCIPAL, input({ newPassword: CURRENT })),
    ).rejects.toBeInstanceOf(PasswordUnchanged);
    expect(written).toEqual([]);
  });

  it('stores the hash of the new password', async () => {
    const { useCase, written } = harness();

    await useCase.execute(PRINCIPAL, input({ newPassword: 'mat-khau-moi' }));

    expect(written).toEqual([{ userId: 'user-1', passwordHash: 'hashed:mat-khau-moi' }]);
  });

  it('signs the OTHER devices out while keeping the calling tab alive', async () => {
    // Signing this session out too would log the user out of the tab they just
    // used, which reads as the change having failed.
    const { useCase, revoked } = harness();

    await useCase.execute(PRINCIPAL, input());

    expect(revoked).toEqual([{ userId: 'user-1', keepSessionId: 'session-1' }]);
  });
});
