import { describe, expect, it } from 'vitest';
import type { AuthOtpVerifyInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { ChallengeExpired } from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePurpose,
  IAuthChallengeStore,
  VerifyChallengeResult,
} from '../../domain/ports/auth-challenge-store.port';
import { OtpAttemptsExceeded, OtpInvalid } from '../auth-challenge-http-errors';
import { VerifyRegistrationUseCase } from './verify-registration.use-case';

function harness(result: VerifyChallengeResult) {
  const asked: Array<{ challengeId: string; purpose: AuthChallengePurpose; otp: string }> = [];
  return {
    useCase: new VerifyRegistrationUseCase(
      fakePort<IAuthChallengeStore>({
        verify: (challengeId, purpose, otp) => {
          asked.push({ challengeId, purpose, otp });
          return Promise.resolve(result);
        },
      }),
    ),
    asked,
  };
}

const input = { challengeId: 'challenge-1', code: '123456' } as AuthOtpVerifyInput;

describe('VerifyRegistrationUseCase', () => {
  it('verifies against the REGISTRATION purpose, not any challenge with that id', async () => {
    // The purpose is what stops a password-reset code being redeemed to create
    // an account on someone else's address.
    const { useCase, asked } = harness({
      status: 'verified',
      completionToken: 'completion-1',
      expiresInSec: 900,
    });

    await useCase.execute(input);

    expect(asked).toEqual([
      { challengeId: 'challenge-1', purpose: 'registration', otp: '123456' },
    ]);
  });

  it('hands back the completion token and its own, shorter lifetime', async () => {
    const { useCase } = harness({
      status: 'verified',
      completionToken: 'completion-1',
      expiresInSec: 900,
    });

    await expect(useCase.execute(input)).resolves.toEqual({
      completionToken: 'completion-1',
      expiresInSec: 900,
    });
  });

  it('reports an expired challenge as expired, not as a wrong code', async () => {
    // The UI restarts the flow on expiry but only re-prompts on a wrong code.
    const { useCase } = harness({ status: 'expired' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ChallengeExpired);
  });

  it('reports a locked challenge separately from a wrong code', async () => {
    const { useCase } = harness({ status: 'locked' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(OtpAttemptsExceeded);
  });

  it('tells the user how many attempts are left on a wrong code', async () => {
    // The count is a top-level wire field, not a nested detail — the OTP screen
    // reads it straight off the body to show "2 lần thử còn lại".
    const { useCase } = harness({ status: 'invalid', attemptsRemaining: 2 });

    const error = await useCase.execute(input).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OtpInvalid);
    expect((error as OtpInvalid).getResponse()).toMatchObject({
      code: 'OTP_INVALID',
      attemptsRemaining: 2,
    });
  });
});
