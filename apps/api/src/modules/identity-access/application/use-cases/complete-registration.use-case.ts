import type { AuthFlowCompleteResponse, AuthPasswordCompleteInput } from '@booking/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { UserAccount } from '../../domain/entities/user-account.entity';
import {
  AUTH_CHALLENGE_STORE,
  type AuthChallengePayload,
  type IAuthChallengeStore,
} from '../../domain/ports/auth-challenge-store.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import {
  REGISTRATION_COMPLETION_REPOSITORY,
  type IRegistrationCompletionRepository,
  type RegistrationCompletionInput,
} from '../../domain/ports/registration-completion-repository.port';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/ports/user-repository.port';
import { expired } from './auth-challenge.helpers';

@Injectable()
export class CompleteRegistrationUseCase {
  private readonly logger = new Logger(CompleteRegistrationUseCase.name);

  constructor(
    @Inject(AUTH_CHALLENGE_STORE) private readonly challenges: IAuthChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(REGISTRATION_COMPLETION_REPOSITORY)
    private readonly registrationCompletion: IRegistrationCompletionRepository,
  ) {}

  private consentFromPayload(
    payload: AuthChallengePayload,
    ip: string | null,
  ): RegistrationCompletionInput['consent'] {
    if (!payload.tenantId || !payload.acceptedVersionIds?.length) return undefined;
    return {
      tenantId: payload.tenantId,
      acceptedVersionIds: payload.acceptedVersionIds,
      acceptedLocale: payload.acceptedLocale ?? 'vi',
      ip,
    };
  }

  private async reconcileExisting(
    existing: UserAccount | null,
    password: string,
    consent: RegistrationCompletionInput['consent'],
  ): Promise<boolean> {
    if (!existing?.emailVerifiedAt || !existing.passwordHash) return false;
    if (!(await this.hasher.verify(existing.passwordHash, password))) return false;

    if (consent) {
      await this.registrationCompletion.emitConsent({
        ...consent,
        userId: existing.id,
      });
    }

    return true;
  }

  private async cleanupCompletion(completionToken: string): Promise<void> {
    try {
      await this.challenges.consumeCompletion(completionToken, 'registration');
    } catch {
      this.logger.warn('registration completed durably but completion-token cleanup failed');
    }
  }

  async execute(
    input: AuthPasswordCompleteInput,
    meta: { ip?: string } = {},
  ): Promise<AuthFlowCompleteResponse> {
    const payload = await this.challenges.peekCompletion(input.completionToken, 'registration');
    if (!payload?.fullName) expired();
    const consent = this.consentFromPayload(payload, meta.ip ?? null);

    const existing = await this.users.findByEmail(payload.email);
    if (existing) {
      const reconciled = await this.reconcileExisting(existing, input.password, consent);
      if (!reconciled) UserAccount.assertEmailAvailable(existing);
      await this.cleanupCompletion(input.completionToken);
      return { success: true };
    }

    const passwordHash = await this.hasher.hash(input.password);
    const newUser = UserAccount.register({
      email: payload.email,
      fullName: payload.fullName,
      locale: payload.locale,
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    const result = await this.registrationCompletion.create({
      user: newUser,
      ...(consent ? { consent } : {}),
    });

    if (result.status === 'created') {
      await this.cleanupCompletion(input.completionToken);
      return { success: true };
    }

    const racedUser = await this.users.findByEmail(payload.email);
    if (!racedUser) {
      throw new Error('Registration email conflict could not be reconciled');
    }

    const reconciled = await this.reconcileExisting(racedUser, input.password, consent);
    if (!reconciled) UserAccount.assertEmailAvailable(racedUser);

    await this.cleanupCompletion(input.completionToken);
    return { success: true };
  }
}
