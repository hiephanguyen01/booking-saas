import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { ISessionStore } from '../../domain/ports/session-store.port';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  it('revokes exactly the session that asked, leaving the other devices alone', async () => {
    // Signing out of one browser must not sign the account out everywhere —
    // `revokeAllForUser` exists for credential resets, not for this.
    const revoked: string[] = [];
    const useCase = new LogoutUseCase(
      fakePort<ISessionStore>({
        revoke: (sessionId) => {
          revoked.push(sessionId);
          return Promise.resolve();
        },
      }),
    );

    await useCase.execute('session-1');

    expect(revoked).toEqual(['session-1']);
  });
});
