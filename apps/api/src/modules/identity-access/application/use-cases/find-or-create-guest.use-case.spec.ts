import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { UserAccount, type NewUserAccount, type UserAccountState } from '../../domain/entities/user-account.entity';
import { EmailRegisteredForGuestBooking } from '../../domain/errors/identity-access-errors';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { FindOrCreateGuestUseCase } from './find-or-create-guest.use-case';

const INPUT = { email: 'khach@studiohub.vn', fullName: 'Khách Lẻ', phone: '0900000000' };

const account = (overrides: Partial<UserAccountState> = {}): UserAccount =>
  UserAccount.rehydrate({
    id: 'user-guest',
    email: INPUT.email,
    passwordHash: null,
    fullName: 'Khách Cũ',
    phone: '0911111111',
    avatarUrl: null,
    locale: 'vi',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    ...overrides,
  });

function harness(existing: UserAccount | null = null) {
  const created: NewUserAccount[] = [];
  return {
    useCase: new FindOrCreateGuestUseCase(
      fakePort<IUserRepository>({
        findByEmail: () => Promise.resolve(existing),
        create: (data) => {
          created.push(data);
          return Promise.resolve({ id: 'user-new', ...data } as unknown as UserRecord);
        },
      }),
    ),
    created,
  };
}

describe('FindOrCreateGuestUseCase', () => {
  it('REFUSES an email that already owns a real account', async () => {
    // Attaching it would let an unauthenticated caller file bookings under the
    // owner's account. They have to sign in instead.
    const { useCase, created } = harness(account({ passwordHash: 'argon2-hash' }));

    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(EmailRegisteredForGuestBooking);
    expect(created).toEqual([]);
  });

  it('reuses a previous guest rather than creating a duplicate identity', async () => {
    // Otherwise the same person's bookings scatter across a new user row per
    // checkout.
    const { useCase, created } = harness(account());

    const result = await useCase.execute(INPUT);

    expect(created).toEqual([]);
    expect(result).toMatchObject({ id: 'user-guest', passwordHash: null });
  });

  it('keeps the STORED name and phone when reusing a guest', async () => {
    // This is an unauthenticated path — letting the request overwrite the stored
    // profile would hand anyone who knows the address a way to rewrite it.
    const { useCase } = harness(account());

    const result = await useCase.execute(INPUT);

    expect(result).toMatchObject({ fullName: 'Khách Cũ', phone: '0911111111' });
  });

  it('creates a PASSWORDLESS identity for a brand-new address', async () => {
    // A guest must not be loggable-in; the upgrade flow is what sets a password.
    const { useCase, created } = harness(null);

    await useCase.execute(INPUT);

    expect(created).toEqual([
      {
        email: INPUT.email,
        passwordHash: null,
        fullName: 'Khách Lẻ',
        phone: '0900000000',
        avatarUrl: null,
        locale: 'vi',
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerifiedAt: null,
      },
    ]);
  });
});
