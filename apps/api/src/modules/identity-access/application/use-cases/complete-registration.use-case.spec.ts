import { describe, expect, it } from 'vitest';
import type { AuthPasswordCompleteInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { UserAccount, type NewUserAccount } from '../../domain/entities/user-account.entity';
import { ChallengeExpired, EmailTaken } from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
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
}

function harness(options: Options = {}) {
  const consumed: Array<{ token: string; purpose: AuthChallengePurpose }> = [];
  const created: NewUserAccount[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new CompleteRegistrationUseCase(
      fakePort<IAuthChallengeStore>({
        consumeCompletion: (token, purpose) => {
          consumed.push({ token, purpose });
          return Promise.resolve(options.payload === undefined ? payload() : options.payload);
        },
      }),
      fakePort<IUserRepository>({
        findByEmail: () =>
          Promise.resolve(
            options.emailTaken ? UserAccount.rehydrate({ id: 'user-0' } as never) : null,
          ),
        create: (data) => {
          created.push(data);
          return Promise.resolve({ id: 'user-1', ...data } as unknown as UserRecord);
        },
      }),
      fakePort<IPasswordHasher>({ hash: (plain) => Promise.resolve(`hashed:${plain}`) }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    consumed,
    created,
    events,
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

  it('refuses when the address was claimed while the OTP was in flight', async () => {
    const { useCase, created } = harness({ emailTaken: true });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(EmailTaken);
    expect(created).toEqual([]);
  });

  it('MARKS the email verified — the OTP is what proved it', async () => {
    const { useCase, created } = harness();
    const before = Date.now();

    await useCase.execute(input);

    const verifiedAt = created[0]?.emailVerifiedAt?.getTime() ?? 0;
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

    expect(created[0]).toMatchObject({
      email: 'parked@studiohub.vn',
      fullName: 'Tên Đã Xác Thực',
      locale: 'en',
      passwordHash: 'hashed:demo-password',
      status: 'active',
    });
  });

  it('records the consent through the OUTBOX, on the tenant that collected it', async () => {
    // identity-access cannot call legal directly — legal already imports its
    // guards, so the reverse edge would close a module cycle.
    const { useCase, tenantDb, events } = harness({
      payload: payload({
        tenantId: 'tenant-1',
        acceptedVersionIds: ['doc-v1'],
        acceptedLocale: 'en',
      }),
    });

    await useCase.execute(input, { ip: '203.0.113.9' });

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(events).toEqual([
      {
        eventType: 'user.registration_consent',
        payload: {
          userId: 'user-1',
          acceptedVersionIds: ['doc-v1'],
          acceptedLocale: 'en',
          ip: '203.0.113.9',
        },
      },
    ]);
  });

  it('defaults the consent locale to Vietnamese and the ip to null', async () => {
    // The acceptance row records which translation was shown; an absent locale
    // means the default one, and a null ip is a fact, not a missing column.
    const { useCase, events } = harness({
      payload: payload({ tenantId: 'tenant-1', acceptedVersionIds: ['doc-v1'] }),
    });

    await useCase.execute(input);

    expect(events[0]?.payload).toMatchObject({ acceptedLocale: 'vi', ip: null });
  });

  it('opens NO transaction when there was no consent to record', async () => {
    // Most registrations tick nothing; a transaction per signup would be pure
    // cost.
    const { useCase, tenantDb, events } = harness();

    await useCase.execute(input);

    expect(tenantDb.openedFor).toEqual([]);
    expect(events).toEqual([]);
  });

  it('records nothing when a tenant is known but nothing was ticked', async () => {
    const { useCase, tenantDb } = harness({
      payload: payload({ tenantId: 'tenant-1', acceptedVersionIds: [] }),
    });

    await useCase.execute(input);

    expect(tenantDb.openedFor).toEqual([]);
  });

  it('records nothing when documents were ticked outside any tenant', async () => {
    // The acceptance row is tenant-scoped; there is nowhere to put it.
    const { useCase, tenantDb } = harness({
      payload: payload({ acceptedVersionIds: ['doc-v1'] }),
    });

    await useCase.execute(input);

    expect(tenantDb.openedFor).toEqual([]);
  });

  it('answers success without leaking the new account back to the caller', async () => {
    // The user is not signed in yet — this flow ends at the login screen.
    const { useCase } = harness();

    await expect(useCase.execute(input)).resolves.toEqual({ success: true });
  });
});
