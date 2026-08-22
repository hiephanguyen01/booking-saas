import { describe, expect, it } from 'vitest';
import type { AuthPasswordCompleteInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount } from '../../domain/entities/user-account.entity';
import { ChallengeExpired, EmailTaken } from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type {
  IRegistrationCompletionRepository,
  RegistrationCompletionInput,
  RegistrationConsentEventInput,
} from '../../domain/ports/registration-completion-repository.port';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { CompleteRegistrationUseCase } from './complete-registration.use-case';

const payload = (overrides: Partial<AuthChallengePayload> = {}): AuthChallengePayload => ({
  purpose: 'registration',
  email: 'khach@studiohub.vn',
  fullName: 'Khách Mới',
  locale: 'vi',
  ...overrides,
});

interface Options {
  payload?: AuthChallengePayload | null;
  emailTaken?: boolean;
  mismatchedPassword?: boolean;
}

function harness(options: Options = {}) {
  const consumed: Array<{ token: string; purpose: AuthChallengePurpose }> = [];
  const created: RegistrationCompletionInput[] = [];
  const emittedConsents: RegistrationConsentEventInput[] = [];
  const currentPayload = options.payload === undefined ? payload() : options.payload;

  return {
    useCase: new CompleteRegistrationUseCase(
      fakePort<IAuthChallengeStore>({
        peekCompletion: (_token, _purpose) => Promise.resolve(currentPayload),
        consumeCompletion: (token, purpose) => {
          consumed.push({ token, purpose });
          return Promise.resolve(currentPayload);
        },
      }),
      fakePort<IUserRepository>({
        findByEmail: () =>
          Promise.resolve(
            options.emailTaken
              ? UserAccount.rehydrate({
                  id: 'user-0',
                  email: 'khach@studiohub.vn',
                  emailVerifiedAt: new Date(),
                  passwordHash: options.mismatchedPassword
                    ? 'hashed:other-password'
                    : 'hashed:demo-password',
                } as never)
              : null,
          ),
      }),
      fakePort<IPasswordHasher>({
        hash: (plain) => Promise.resolve(`hashed:${plain}`),
        verify: (hash, plain) => Promise.resolve(hash === `hashed:${plain}`),
      }),
      fakePort<IRegistrationCompletionRepository>({
        create: (input) => {
          created.push(input);
          return Promise.resolve({
            status: 'created',
            user: { id: 'user-1', ...input.user } as unknown as UserRecord,
          });
        },
        emitConsent: (consent) => {
          emittedConsents.push(consent);
          return Promise.resolve();
        },
      }),
    ),
    consumed,
    created,
    emittedConsents,
  };
}

const input = { completionToken: 'completion-1', password: 'demo-password' } as AuthPasswordCompleteInput;

describe('CompleteRegistrationUseCase', () => {
  it('CONSUMES the completion token, so a replay cannot create a second account', async () => {
    const { useCase, consumed } = harness();

    await useCase.execute(input);

    expect(consumed).toEqual([{ token: 'completion-1', purpose: 'registration' }]);
  });

  it('reports an unknown or already-used token as expired', async () => {
    const { useCase, created } = harness({ payload: null });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ChallengeExpired);
    expect(created).toEqual([]);
  });

  it('refuses a password-reset payload that reached this endpoint', async () => {
    // A reset challenge carries no `fullName`; without that check it would
    // create a nameless account on an address it never proved ownership of.
    const { useCase, created } = harness({ payload: payload({ fullName: undefined }) });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ChallengeExpired);
    expect(created).toEqual([]);
  });

  it('refuses when the address was claimed while the OTP was in flight with different password', async () => {
    const { useCase, created } = harness({ emailTaken: true, mismatchedPassword: true });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(EmailTaken);
    expect(created).toEqual([]);
  });

  it('reconciles with existing account when password matches', async () => {
    const { useCase, created, consumed } = harness({ emailTaken: true });

    const result = await useCase.execute(input);

    expect(result).toEqual({ success: true });
    expect(created).toEqual([]);
    expect(consumed).toEqual([{ token: 'completion-1', purpose: 'registration' }]);
  });

  it('MARKS the email verified — the OTP is what proved it', async () => {
    const { useCase, created } = harness();
    const before = Date.now();

    await useCase.execute(input);

    const verifiedAt = created[0]?.user.emailVerifiedAt?.getTime() ?? 0;
    expect(verifiedAt).toBeGreaterThanOrEqual(before);
    expect(verifiedAt).toBeLessThanOrEqual(Date.now());
  });

  it('takes the identity from the CHALLENGE, never from the request body', async () => {
    // The body only carries a password; anything else here would let a caller
    // register an address they never verified.
    const { useCase, created } = harness({
      payload: payload({ email: 'parked@studiohub.vn', fullName: 'Tên Đã Xác Thực', locale: 'en' }),
    });

    await useCase.execute(input);

    expect(created[0]?.user).toMatchObject({
      email: 'parked@studiohub.vn',
      fullName: 'Tên Đã Xác Thực',
      locale: 'en',
      passwordHash: 'hashed:demo-password',
      status: 'active',
    });
  });

  it('passes the consent to registrationCompletion.create on the tenant that collected it', async () => {
    const { useCase, created } = harness({
      payload: payload({
        tenantId: 'tenant-1',
        acceptedVersionIds: ['doc-v1'],
        acceptedLocale: 'en',
      }),
    });

    await useCase.execute(input, { ip: '203.0.113.9' });

    expect(created[0]?.consent).toEqual({
      tenantId: 'tenant-1',
      acceptedVersionIds: ['doc-v1'],
      acceptedLocale: 'en',
      ip: '203.0.113.9',
    });
  });

  it('defaults the consent locale to Vietnamese and the ip to null', async () => {
    const { useCase, created } = harness({
      payload: payload({ tenantId: 'tenant-1', acceptedVersionIds: ['doc-v1'] }),
    });

    await useCase.execute(input);

    expect(created[0]?.consent).toMatchObject({ acceptedLocale: 'vi', ip: null });
  });

  it('omits consent when there was no consent to record', async () => {
    const { useCase, created } = harness();

    await useCase.execute(input);

    expect(created[0]?.consent).toBeUndefined();
  });

  it('omits consent when a tenant is known but nothing was ticked', async () => {
    const { useCase, created } = harness({
      payload: payload({ tenantId: 'tenant-1', acceptedVersionIds: [] }),
    });

    await useCase.execute(input);

    expect(created[0]?.consent).toBeUndefined();
  });

  it('omits consent when documents were ticked outside any tenant', async () => {
    const { useCase, created } = harness({
      payload: payload({ acceptedVersionIds: ['doc-v1'] }),
    });

    await useCase.execute(input);

    expect(created[0]?.consent).toBeUndefined();
  });

  it('answers success without leaking the new account back to the caller', async () => {
    const { useCase } = harness();

    await expect(useCase.execute(input)).resolves.toEqual({ success: true });
  });
});
