import { describe, expect, it } from 'vitest';
import type { RegistrationStartInput } from '@booking/contracts';
import { fakePort } from '~testing';
import { UserAccount } from '../../domain/entities/user-account.entity';
import { EmailTaken } from '../../domain/errors/identity-access-errors';
import type {
  AuthChallengePayload,
  IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import type { IAuthEmailSender } from '../../domain/ports/auth-email-sender.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { StartRegistrationUseCase } from './start-registration.use-case';

const CHALLENGE = {
  challengeId: 'challenge-1',
  otp: '123456',
  expiresInSec: 600,
  resendAfterSec: 60,
};

function harness(options: { emailTaken?: boolean } = {}) {
  const issued: AuthChallengePayload[] = [];
  const sent: Array<Record<string, unknown>> = [];
  return {
    useCase: new StartRegistrationUseCase(
      fakePort<IUserRepository>({
        findByEmail: () =>
          Promise.resolve(
            options.emailTaken ? UserAccount.rehydrate({ id: 'user-0' } as never) : null,
          ),
      }),
      fakePort<IAuthChallengeStore>({
        issue: (payload) => {
          issued.push(payload);
          return Promise.resolve(CHALLENGE);
        },
      }),
      fakePort<IAuthEmailSender>({
        sendOtp: (args) => {
          sent.push(args as unknown as Record<string, unknown>);
          return Promise.resolve();
        },
      }),
    ),
    issued,
    sent,
  };
}

const input = (overrides: Partial<RegistrationStartInput> = {}) =>
  ({
    email: 'khach@studiohub.vn',
    fullName: 'Khách Mới',
    locale: 'vi',
    ...overrides,
  }) as RegistrationStartInput;

describe('StartRegistrationUseCase', () => {
  it('refuses an email that already has an account, sending no code', async () => {
    const { useCase, sent } = harness({ emailTaken: true });

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(EmailTaken);
    expect(sent).toEqual([]);
  });

  it('MASKS the destination in the response', async () => {
    // The response goes to a browser that has not proven it owns the address, so
    // it must not echo the address back in full.
    const { useCase } = harness();

    const result = await useCase.execute(input({ email: 'nguyenvana@studiohub.vn' }));

    expect(result.maskedDestination).toBe('ng********@studiohub.vn');
    expect(result.maskedDestination).not.toContain('nguyenvana');
  });

  it('never returns the OTP itself', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(input());

    expect(JSON.stringify(result)).not.toContain(CHALLENGE.otp);
    expect(result).toEqual({
      challengeId: 'challenge-1',
      maskedDestination: 'kh***@studiohub.vn',
      expiresInSec: 600,
      resendAfterSec: 60,
    });
  });

  it('parks the consent selection on the challenge for the completion step', async () => {
    // The acceptance row can only be written once a user id exists, which is
    // after the OTP is verified — so the tick has to survive the round trip.
    const { useCase, issued } = harness();

    await useCase.execute(
      input({
        tenantId: 'tenant-1',
        acceptedVersionIds: ['doc-v1', 'doc-v2'],
        acceptedLocale: 'en',
      }),
    );

    expect(issued).toEqual([
      {
        purpose: 'registration',
        email: 'khach@studiohub.vn',
        fullName: 'Khách Mới',
        locale: 'vi',
        tenantId: 'tenant-1',
        acceptedVersionIds: ['doc-v1', 'doc-v2'],
        acceptedLocale: 'en',
      },
    ]);
  });

  it('omits the optional keys entirely rather than parking undefined', async () => {
    const { useCase, issued } = harness();

    await useCase.execute(input());

    expect(Object.keys(issued[0] ?? {})).toEqual(['purpose', 'email', 'fullName', 'locale']);
  });

  it('treats an EMPTY consent list as no consent at all', async () => {
    const { useCase, issued } = harness();

    await useCase.execute(input({ tenantId: 'tenant-1', acceptedVersionIds: [] }));

    expect(issued[0]).not.toHaveProperty('acceptedVersionIds');
  });

  it('emails the code with the tenant branding the request came from', async () => {
    const { useCase, sent } = harness();

    await useCase.execute(input({ tenantId: 'tenant-1' }));

    expect(sent).toEqual([
      {
        purpose: 'registration',
        email: 'khach@studiohub.vn',
        fullName: 'Khách Mới',
        locale: 'vi',
        otp: '123456',
        expiresInSec: 600,
        challengeId: 'challenge-1',
        tenantId: 'tenant-1',
      },
    ]);
  });
});
