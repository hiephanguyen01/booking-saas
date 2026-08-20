import { describe, expect, it } from 'vitest';
import type { UpdateMyProfileInput } from '@booking/contracts';
import { fakePort } from '~testing';
import {
  UserAccount,
  type ProfileIntent,
  type UserAccountState,
} from '../../domain/entities/user-account.entity';
import { AccountSuspended, UserNotFound } from '../../domain/errors/identity-access-errors';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { UpdateMyProfileUseCase } from './update-my-profile.use-case';

const STORED = {
  id: 'user-1',
  email: 'khach@studiohub.vn',
  passwordHash: 'argon2-hash',
  fullName: 'Tên Cũ',
  phone: '0911111111',
  avatarUrl: 'https://cdn/avatar-old.png',
  locale: 'vi',
  status: 'active',
  failedLoginCount: 0,
  lockedUntil: null,
  emailVerifiedAt: null,
} satisfies UserAccountState;

const account = (overrides: Partial<UserAccountState> = {}): UserAccount =>
  UserAccount.rehydrate({ ...STORED, ...overrides });

function harness(user: UserAccount | null = account()) {
  const intents: ProfileIntent[] = [];
  return {
    useCase: new UpdateMyProfileUseCase(
      fakePort<IUserRepository>({
        findById: () => Promise.resolve(user),
        updateProfile: (userId, intent) => {
          intents.push(intent);
          return Promise.resolve({ ...STORED, ...intent, id: userId } as unknown as UserRecord);
        },
      }),
    ),
    intents,
  };
}

const input = (overrides: Record<string, unknown>) =>
  ({ fullName: 'Tên Mới', ...overrides }) as UpdateMyProfileInput;

describe('UpdateMyProfileUseCase', () => {
  it('answers not-found when the session points at a deleted user', async () => {
    const { useCase, intents } = harness(null);

    await expect(useCase.execute('user-1', input({}))).rejects.toBeInstanceOf(UserNotFound);
    expect(intents).toEqual([]);
  });

  it('refuses an edit from a suspended account', async () => {
    const { useCase, intents } = harness(account({ status: 'suspended' }));

    await expect(useCase.execute('user-1', input({}))).rejects.toBeInstanceOf(AccountSuspended);
    expect(intents).toEqual([]);
  });

  it('LEAVES an omitted field alone rather than blanking it', async () => {
    // A card that submits only the name must not wipe the phone and the photo.
    const { useCase, intents } = harness();

    await useCase.execute('user-1', input({}));

    expect(intents).toEqual([
      { fullName: 'Tên Mới', phone: '0911111111', avatarUrl: 'https://cdn/avatar-old.png' },
    ]);
  });

  it('treats an explicit null as "clear this field"', async () => {
    // Removing your photo has to be expressible, and it is the only way to tell
    // it apart from not submitting the field.
    const { useCase, intents } = harness();

    await useCase.execute('user-1', input({ phone: null, avatarUrl: null }));

    expect(intents).toEqual([{ fullName: 'Tên Mới', phone: null, avatarUrl: null }]);
  });

  it('returns the CurrentUser shape, without the password hash', async () => {
    // The same shape /auth/me answers with — a leaked hash here would ship to
    // the browser on every profile save.
    const { useCase } = harness();

    const result = await useCase.execute('user-1', input({}));

    expect(result).toEqual({
      id: 'user-1',
      email: 'khach@studiohub.vn',
      fullName: 'Tên Mới',
      phone: '0911111111',
      avatarUrl: 'https://cdn/avatar-old.png',
      locale: 'vi',
      status: 'active',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });
});
