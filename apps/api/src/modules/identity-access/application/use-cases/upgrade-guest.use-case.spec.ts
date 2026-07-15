import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type { ISessionStore, SessionTokens } from '../../domain/ports/session-store.port';
import { UpgradeGuestUseCase } from './upgrade-guest.use-case';

const GUEST: UserRecord = {
  id: 'user-1',
  email: 'guest@example.com',
  passwordHash: null,
  fullName: 'Guest',
  phone: '0900000000',
  locale: 'vi',
  status: 'active',
  failedLoginCount: 0,
  lockedUntil: null,
  emailVerifiedAt: null,
};

const tokens: SessionTokens = {
  sessionId: 's',
  accessToken: 'a',
  accessExpiresAt: new Date(),
  refreshToken: 'r',
  refreshExpiresAt: new Date(),
};

function setup(existing: UserRecord | null) {
  const setPassword = vi.fn(async (id: string, passwordHash: string) => ({ ...GUEST, id, passwordHash }));
  const users: Partial<IUserRepository> = {
    findByEmail: vi.fn(async () => existing),
    setPassword,
  };
  const hasher: Partial<IPasswordHasher> = { hash: vi.fn(async () => 'hashed') };
  const sessions: Partial<ISessionStore> = { create: vi.fn(async () => tokens) };
  const useCase = new UpgradeGuestUseCase(users as IUserRepository, hasher as IPasswordHasher, sessions as ISessionStore);
  return { useCase, setPassword, sessions };
}

const input = { email: 'guest@example.com', password: 'super-secret-1' };

describe('UpgradeGuestUseCase — §8.6', () => {
  it('upgrades a passwordless guest and issues a session', async () => {
    const { useCase, setPassword, sessions } = setup(GUEST);
    const { user, tokens: issued } = await useCase.execute(input, {});
    expect(setPassword).toHaveBeenCalledWith('user-1', 'hashed');
    expect(user.passwordHash).toBe('hashed');
    expect(sessions.create).toHaveBeenCalledWith('user-1', {});
    expect(issued).toBe(tokens);
  });

  it('refuses to overwrite an email that already owns a password account', async () => {
    const { useCase, setPassword } = setup({ ...GUEST, passwordHash: 'existing' });
    await expect(useCase.execute(input, {})).rejects.toBeInstanceOf(ConflictException);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('404s when no guest exists for the email', async () => {
    const { useCase, setPassword } = setup(null);
    await expect(useCase.execute(input, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(setPassword).not.toHaveBeenCalled();
  });
});
