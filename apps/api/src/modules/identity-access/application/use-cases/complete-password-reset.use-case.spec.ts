import { describe, expect, it } from 'vitest';
import type { AuthPasswordCompleteInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { ChallengeExpired } from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IPasswordHasher } from '../../domain/ports/password-hasher.port';
import type { ISessionStore } from '../../domain/ports/session-store.port';
import type { IUserRepository, UserRecord } from '../../domain/ports/user-repository.port';
import { CompletePasswordResetUseCase } from './complete-password-reset.use-case';

const payload = (overrides: Partial<AuthChallengePayload> = {}): AuthChallengePayload => ({
  purpose: 'password_reset',
  email: 'khach@studiohub.vn',
  locale: 'vi',
  userId: 'user-1',
  ...overrides,
});

function harness(consumed: AuthChallengePayload | null = payload()) {
  const asked: Array<{ token: string; purpose: AuthChallengePurpose }> = [];
  const written: Array<{ userId: string; passwordHash: string }> = [];
  const revoked: string[] = [];
  return {
    useCase: new CompletePasswordResetUseCase(
      fakePort<IAuthChallengeStore>({
        consumeCompletion: (token, purpose) => {
          asked.push({ token, purpose });
          return Promise.resolve(consumed);
        },
      }),
      fakePort<IUserRepository>({
        setPassword: (userId, passwordHash) => {
          written.push({ userId, passwordHash });
          return Promise.resolve({ id: userId } as UserRecord);
        },
      }),
      fakePort<IPasswordHasher>({ hash: (plain) => Promise.resolve(`hashed:${plain}`) }),
      fakePort<ISessionStore>({
        revokeAllForUser: (userId) => {
          revoked.push(userId);
          return Promise.resolve();
        },
      }),
    ),
    asked,
    written,
    revoked,
  };
}

const input = {
  completionToken: 'completion-1',
  password: 'mat-khau-moi',
} as AuthPasswordCompleteInput;

describe('CompletePasswordResetUseCase', () => {
  it('consumes the token against the PASSWORD RESET purpose', async () => {
    // Otherwise a registration completion token could set the password of an
    // account it was never issued for.
    const { useCase, asked } = harness();

    await useCase.execute(input);

    expect(asked).toEqual([{ token: 'completion-1', purpose: 'password_reset' }]);
  });

  it('reports an unknown or already-used token as expired', async () => {
    const { useCase, written } = harness(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ChallengeExpired);
    expect(written).toEqual([]);
  });

  it('answers SUCCESS for a decoy challenge without writing anything', async () => {
    // The decoy exists so an unknown address gets the same flow; failing here
    // would give back the enumeration signal the decoy was built to hide.
    const { useCase, written, revoked } = harness(payload({ userId: undefined }));

    await expect(useCase.execute(input)).resolves.toEqual({ success: true });
    expect(written).toEqual([]);
    expect(revoked).toEqual([]);
  });

  it('sets the hashed password on the user the CHALLENGE names', async () => {
    const { useCase, written } = harness();

    await useCase.execute(input);

    expect(written).toEqual([{ userId: 'user-1', passwordHash: 'hashed:mat-khau-moi' }]);
  });

  it('signs EVERY device out after the reset', async () => {
    // A reset is the response to a suspected compromise, so a session opened
    // with the old password must not survive it.
    const { useCase, revoked } = harness();

    await useCase.execute(input);

    expect(revoked).toEqual(['user-1']);
  });
});
