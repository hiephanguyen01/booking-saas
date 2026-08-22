import { describe, expect, it } from 'vitest';
import type { AuthOtpVerifyInput } from '@booking/contracts';
import { fakePort } from '~testing';
import type {
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { VerifyPasswordResetUseCase } from './verify-password-reset.use-case';

describe('VerifyPasswordResetUseCase', () => {
  it('verifies against the PASSWORD RESET purpose', async () => {
    // Same shared flow as registration; the purpose is the only thing that stops
    // a code issued for one from being redeemed by the other.
    const asked: Array<{ challengeId: string; purpose: AuthChallengePurpose; otp: string }> = [];
    const useCase = new VerifyPasswordResetUseCase(
      fakePort<IAuthChallengeStore>({
        verify: (challengeId, purpose, otp) => {
          asked.push({ challengeId, purpose, otp });
          return Promise.resolve({
            status: 'verified',
            completionToken: 'completion-1',
            expiresInSec: 900,
          });
        },
      }),
    );

    await expect(
      useCase.execute({ challengeId: 'challenge-1', code: '123456' } as AuthOtpVerifyInput),
    ).resolves.toEqual({ completionToken: 'completion-1', expiresInSec: 900 });
    expect(asked).toEqual([
      { challengeId: 'challenge-1', purpose: 'password_reset', otp: '123456' },
    ]);
  });
});
