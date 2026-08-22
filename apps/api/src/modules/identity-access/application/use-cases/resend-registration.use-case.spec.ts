import { describe, expect, it } from 'vitest';
import type { AuthChallengeInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { ChallengeExpired } from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePurpose,
  IAuthChallengeStore,
  ResendChallengeResult,
} from '../../domain/ports/auth-challenge-store.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';
import { OtpResendCooldown } from '../auth-challenge-http-errors';
import { ResendRegistrationUseCase } from './resend-registration.use-case';

const CHALLENGE = {
  challengeId: 'challenge-1',
  otp: '654321',
  expiresInSec: 600,
  resendAfterSec: 60,
};

const issued = (payload: Record<string, unknown>): ResendChallengeResult => ({
  status: 'issued',
  challenge: CHALLENGE,
  payload: {
    purpose: 'registration',
    email: 'khach@studiohub.vn',
    fullName: 'Khách Mới',
    locale: 'vi',
    ...payload,
  } as never,
});

function harness(result: ResendChallengeResult) {
  const asked: Array<{ challengeId: string; purpose: AuthChallengePurpose }> = [];
  const sent: Array<Record<string, unknown>> = [];
  return {
    useCase: new ResendRegistrationUseCase(
      fakePort<IAuthChallengeStore>({
        resend: (challengeId, purpose) => {
          asked.push({ challengeId, purpose });
          return Promise.resolve(result);
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

const input = (overrides: Partial<AuthChallengeInput> = {}) =>
  ({ challengeId: 'challenge-1', ...overrides }) as AuthChallengeInput;

describe('ResendRegistrationUseCase', () => {
  it('resends against the REGISTRATION purpose', async () => {
    const { useCase, asked } = harness(issued({}));

    await useCase.execute(input());

    expect(asked).toEqual([{ challengeId: 'challenge-1', purpose: 'registration' }]);
  });

  it('refuses inside the cooldown and says how long is left', async () => {
    // Without the retry-after the UI cannot re-enable its button at the right
    // moment, and the resend becomes an email-flooding tool.
    const { useCase, sent } = harness({ status: 'cooldown', retryAfterSec: 42 });

    const error = await useCase.execute(input()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OtpResendCooldown);
    expect((error as OtpResendCooldown).getResponse()).toMatchObject({
      code: 'RESEND_COOLDOWN',
      retryAfterSec: 42,
    });
    expect(sent).toEqual([]);
  });

  it('reports an expired challenge instead of quietly issuing a new one', async () => {
    const { useCase, sent } = harness({ status: 'expired' });

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(ChallengeExpired);
    expect(sent).toEqual([]);
  });

  it('emails the NEW code, never the old one', async () => {
    const { useCase, sent } = harness(issued({}));

    await useCase.execute(input());

    expect(sent[0]).toMatchObject({
      purpose: 'registration',
      email: 'khach@studiohub.vn',
      otp: '654321',
      challengeId: 'challenge-1',
      expiresInSec: 600,
    });
  });

  it("prefers the tenant PARKED on the challenge over the one the caller claims", async () => {
    // The request that re-sends is unauthenticated; taking its tenant would let
    // a caller re-brand another tenant's email.
    const { useCase, sent } = harness(issued({ tenantId: 'tenant-parked' }));

    await useCase.execute(input({ tenantId: 'tenant-claimed' }));

    expect(sent[0]).toMatchObject({ tenantId: 'tenant-parked' });
  });

  it('falls back to the requested tenant when the challenge carries none', async () => {
    const { useCase, sent } = harness(issued({}));

    await useCase.execute(input({ tenantId: 'tenant-claimed' }));

    expect(sent[0]).toMatchObject({ tenantId: 'tenant-claimed' });
  });

  it('returns the masked destination and the fresh cooldown', async () => {
    const { useCase } = harness(issued({}));

    await expect(useCase.execute(input())).resolves.toEqual({
      challengeId: 'challenge-1',
      maskedDestination: 'kh***@studiohub.vn',
      expiresInSec: 600,
      resendAfterSec: 60,
    });
  });
});
