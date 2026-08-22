import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import {
  InvalidRefreshToken,
  MissingRefreshToken,
} from '../../domain/errors/identity-access-errors';
import type { ISessionStore, SessionTokens } from '../../domain/ports/session-store.port';
import { RefreshSessionUseCase } from './refresh-session.use-case';

const TOKENS: SessionTokens = {
  sessionId: 'session-1',
  accessToken: 'sid-next',
  accessExpiresAt: new Date('2026-08-19T12:00:00Z'),
  refreshToken: 'rid-next',
  refreshExpiresAt: new Date('2026-09-19T12:00:00Z'),
};

function harness(rotated: SessionTokens | null = TOKENS) {
  const seen: string[] = [];
  return {
    useCase: new RefreshSessionUseCase(
      fakePort<ISessionStore>({
        rotate: (refreshToken) => {
          seen.push(refreshToken);
          return Promise.resolve(rotated);
        },
      }),
    ),
    seen,
  };
}

describe('RefreshSessionUseCase', () => {
  it('tells an absent cookie apart from a rejected one', async () => {
    // The storefront retries on "invalid" but redirects to login on "missing";
    // collapsing the two would put a first-time visitor into a refresh loop.
    const missing = harness();
    const invalid = harness(null);

    await expect(missing.useCase.execute(undefined)).rejects.toBeInstanceOf(MissingRefreshToken);
    await expect(invalid.useCase.execute('rid-old')).rejects.toBeInstanceOf(InvalidRefreshToken);
  });

  it('treats an empty string as no token at all, without consulting the store', async () => {
    const { useCase, seen } = harness();

    await expect(useCase.execute('')).rejects.toBeInstanceOf(MissingRefreshToken);
    expect(seen).toEqual([]);
  });

  it('ROTATES the presented token and returns the new pair', async () => {
    // Both tokens change on every refresh — a replayed refresh token must not
    // keep working.
    const { useCase, seen } = harness();

    const result = await useCase.execute('rid-old');

    expect(seen).toEqual(['rid-old']);
    expect(result).toBe(TOKENS);
  });
});
