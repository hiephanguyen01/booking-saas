import type { AuthChallengeResponse } from '@booking/contracts';
import { GoneException } from '@nestjs/common';
import type { IssuedAuthChallenge } from '../../domain/ports/auth-challenge-store.port';

const maskedEmail = (email: string): string => {
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
};

export const toResponse = (
  challenge: IssuedAuthChallenge,
  email: string,
): AuthChallengeResponse => ({
  challengeId: challenge.challengeId,
  maskedDestination: maskedEmail(email),
  expiresInSec: challenge.expiresInSec,
  resendAfterSec: challenge.resendAfterSec,
});

export function expired(): never {
  throw new GoneException({
    statusCode: 410,
    code: 'CHALLENGE_EXPIRED',
    message: 'The verification request has expired',
  });
}
