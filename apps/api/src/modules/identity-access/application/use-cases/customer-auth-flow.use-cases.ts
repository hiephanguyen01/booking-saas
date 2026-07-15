import type {
  AuthChallengeInput,
  AuthChallengeResponse,
  AuthFlowCompleteResponse,
  AuthOtpVerifiedResponse,
  AuthOtpVerifyInput,
  AuthPasswordCompleteInput,
  PasswordResetStartInput,
  RegistrationStartInput,
} from '@booking/contracts';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  AUTH_CHALLENGE_STORE,
  type AuthChallengePurpose,
  type IAuthChallengeStore,
  type IssuedAuthChallenge,
} from '../../domain/ports/auth-challenge-store.port';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from '../../domain/ports/auth-email-sender.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import { SESSION_STORE, type ISessionStore } from '../../domain/ports/session-store.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';

const maskedEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
};

const toResponse = (challenge: IssuedAuthChallenge, email: string): AuthChallengeResponse => ({
  challengeId: challenge.challengeId,
  maskedDestination: maskedEmail(email),
  expiresInSec: challenge.expiresInSec,
  resendAfterSec: challenge.resendAfterSec,
});

function expired(): never {
  throw new GoneException({
    statusCode: 410,
    code: 'CHALLENGE_EXPIRED',
    message: 'The verification request has expired',
  });
}

@Injectable()
export class StartRegistrationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: IAuthEmailSender,
  ) {}

  async execute(input: RegistrationStartInput): Promise<AuthChallengeResponse> {
    if (await this.users.findByEmail(input.email)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_TAKEN',
        message: 'Email is already registered',
      });
    }
    const challenge = await this.challenges.issue({
      purpose: 'registration',
      email: input.email,
      fullName: input.fullName,
      locale: input.locale,
    });
    await this.email.sendOtp({
      purpose: 'registration',
      email: input.email,
      fullName: input.fullName,
      locale: input.locale,
      otp: challenge.otp,
      expiresInSec: challenge.expiresInSec,
    });
    return toResponse(challenge, input.email);
  }
}

abstract class ResendOtpUseCase {
  constructor(
    protected readonly challenges: IAuthChallengeStore,
    protected readonly email: IAuthEmailSender,
    private readonly purpose: AuthChallengePurpose,
  ) {}

  async execute(input: AuthChallengeInput): Promise<AuthChallengeResponse> {
    const result = await this.challenges.resend(input.challengeId, this.purpose);
    if (result.status === 'expired') expired();
    if (result.status === 'cooldown') {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'RESEND_COOLDOWN',
          message: 'Please wait before requesting another code',
          retryAfterSec: result.retryAfterSec,
        },
        429,
      );
    }
    if (result.payload.purpose === 'registration' || result.payload.userId) {
      await this.email.sendOtp({
        purpose: result.payload.purpose,
        email: result.payload.email,
        fullName: result.payload.fullName,
        locale: result.payload.locale,
        otp: result.challenge.otp,
        expiresInSec: result.challenge.expiresInSec,
      });
    }
    return toResponse(result.challenge, result.payload.email);
  }
}

@Injectable()
export class ResendRegistrationUseCase extends ResendOtpUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) email: IAuthEmailSender,
  ) {
    super(challenges, email, 'registration');
  }
}

abstract class VerifyOtpUseCase {
  constructor(
    private readonly challenges: IAuthChallengeStore,
    private readonly purpose: AuthChallengePurpose,
  ) {}

  async execute(input: AuthOtpVerifyInput): Promise<AuthOtpVerifiedResponse> {
    const result = await this.challenges.verify(input.challengeId, this.purpose, input.code);
    if (result.status === 'expired') expired();
    if (result.status === 'locked') {
      throw new HttpException(
        { statusCode: 429, code: 'OTP_ATTEMPTS_EXCEEDED', message: 'Too many invalid attempts' },
        429,
      );
    }
    if (result.status === 'invalid') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'OTP_INVALID',
        message: 'The verification code is invalid',
        attemptsRemaining: result.attemptsRemaining,
      });
    }
    return { completionToken: result.completionToken, expiresInSec: result.expiresInSec };
  }
}

@Injectable()
export class VerifyRegistrationUseCase extends VerifyOtpUseCase {
  constructor(@Inject(AUTH_CHALLENGE_STORE) challenges: IAuthChallengeStore) {
    super(challenges, 'registration');
  }
}

@Injectable()
export class CompleteRegistrationUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: AuthPasswordCompleteInput): Promise<AuthFlowCompleteResponse> {
    const payload = await this.challenges.consumeCompletion(input.completionToken, 'registration');
    if (!payload?.fullName) expired();
    if (await this.users.findByEmail(payload.email)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_TAKEN',
        message: 'Email is already registered',
      });
    }
    await this.users.create({
      email: payload.email,
      fullName: payload.fullName,
      locale: payload.locale,
      passwordHash: await this.hasher.hash(input.password),
      emailVerifiedAt: new Date(),
    });
    return { success: true };
  }
}

@Injectable()
export class StartPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: IAuthEmailSender,
  ) {}

  async execute(input: PasswordResetStartInput): Promise<AuthChallengeResponse> {
    const user = await this.users.findByEmail(input.email);
    const challenge = await this.challenges.issue({
      purpose: 'password_reset',
      email: input.email,
      locale: input.locale,
      ...(user?.passwordHash ? { userId: user.id, fullName: user.fullName } : {}),
    });
    if (user?.passwordHash) {
      await this.email.sendOtp({
        purpose: 'password_reset',
        email: input.email,
        fullName: user.fullName,
        locale: input.locale,
        otp: challenge.otp,
        expiresInSec: challenge.expiresInSec,
      });
    }
    return toResponse(challenge, input.email);
  }
}

@Injectable()
export class ResendPasswordResetUseCase extends ResendOtpUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) challenges: IAuthChallengeStore,
    @Inject(AUTH_EMAIL_SENDER) email: IAuthEmailSender,
  ) {
    super(challenges, email, 'password_reset');
  }
}

@Injectable()
export class VerifyPasswordResetUseCase extends VerifyOtpUseCase {
  constructor(@Inject(AUTH_CHALLENGE_STORE) challenges: IAuthChallengeStore) {
    super(challenges, 'password_reset');
  }
}

@Injectable()
export class CompletePasswordResetUseCase {
  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async execute(input: AuthPasswordCompleteInput): Promise<AuthFlowCompleteResponse> {
    const payload = await this.challenges.consumeCompletion(
      input.completionToken,
      'password_reset',
    );
    if (!payload) expired();
    if (!payload.userId) return { success: true };
    await this.users.setPassword(payload.userId, await this.hasher.hash(input.password));
    await this.sessions.revokeAllForUser(payload.userId);
    return { success: true };
  }
}
