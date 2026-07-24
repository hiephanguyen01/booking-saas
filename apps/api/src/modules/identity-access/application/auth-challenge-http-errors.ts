import { BadRequestException, HttpException } from '@nestjs/common';

/**
 * OTP protocol errors keep retry metadata as top-level wire fields, so they
 * remain named Nest exceptions instead of DomainError.
 */
export class OtpAttemptsExceeded extends HttpException {
  constructor() {
    super(
      {
        statusCode: 429,
        code: 'OTP_ATTEMPTS_EXCEEDED',
        message: 'Too many invalid attempts',
      },
      429,
    );
  }
}

export class OtpInvalid extends BadRequestException {
  constructor(attemptsRemaining: number) {
    super({
      statusCode: 400,
      code: 'OTP_INVALID',
      message: 'The verification code is invalid',
      attemptsRemaining,
    });
  }
}

export class OtpResendCooldown extends HttpException {
  constructor(retryAfterSec: number) {
    super(
      {
        statusCode: 429,
        code: 'RESEND_COOLDOWN',
        message: 'Please wait before requesting another code',
        retryAfterSec,
      },
      429,
    );
  }
}
