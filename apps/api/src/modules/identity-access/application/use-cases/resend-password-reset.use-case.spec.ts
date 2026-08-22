import { describe, expect, it } from 'vitest';
import type { AuthChallengeInput } from '@booking/contracts';
import { fakePort } from '~testing';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';
import { ResendPasswordResetUseCase } from './resend-password-reset.use-case';

const CHALLENGE = {
  challengeId: 'challenge-1',
  otp: '654321',
  expiresInSec: 600,
  resendAfterSec: 60,
};

function harness(payload: Partial<AuthChallengePayload>) {
  const asked: Array<{ challengeId: string; purpose: AuthChallengePurpose }> = [];
  const sent: Array<Record<string, unknown>> = [];
  return {
    useCase: new ResendPasswordResetUseCase(
      fakePort<IAuthChallengeStore>({
        resend: (challengeId, purpose) => {
          asked.push({ challengeId, purpose });
          return Promise.resolve({
            status: 'issued',
            challenge: CHALLENGE,
            payload: {
              purpose: 'password_reset',
              email: 'khach@studiohub.vn',
              locale: 'vi',
              ...payload,
            } as AuthChallengePayload,
          });
        },
      }),
      fakePort<IAuthEmailSender>({
        sendOtp: (args) => {
          sent.push(args as unknown as Record<string, unknown>);
          return Promise.resolve();
        },
      }),
    ),
    asked,
    sent,
  };
}

const input = { challengeId: 'challenge-1' } as AuthChallengeInput;

describe('ResendPasswordResetUseCase', () => {
  it('resends against the PASSWORD RESET purpose', async () => {
    const { useCase, asked } = harness({ userId: 'user-1', fullName: 'Khách Cũ' });

    await useCase.execute(input);

    expect(asked).toEqual([{ challengeId: 'challenge-1', purpose: 'password_reset' }]);
  });

  it('sends nothing for a DECOY challenge, and still answers normally', async () => {
    // The decoy has no user id: the address has no password account. Emailing
    // here would tell an attacker the address is not on file — the opposite of
    // what the decoy is for — and would spam a stranger's inbox.
    const { useCase, sent } = harness({});

    const result = await useCase.execute(input);

    expect(sent).toEqual([]);
    expect(result).toEqual({
      challengeId: 'challenge-1',
      maskedDestination: 'kh***@studiohub.vn',
      expiresInSec: 600,
      resendAfterSec: 60,
    });
  });

  it('emails the new code when the challenge belongs to a real account', async () => {
    const { useCase, sent } = harness({ userId: 'user-1', fullName: 'Khách Cũ' });

    await useCase.execute(input);

    expect(sent[0]).toMatchObject({
      purpose: 'password_reset',
      email: 'khach@studiohub.vn',
      fullName: 'Khách Cũ',
      otp: '654321',
    });
  });
});
