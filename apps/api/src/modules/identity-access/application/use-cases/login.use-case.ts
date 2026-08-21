import type { LoginInput } from '@booking/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AuthRateLimited,
  InvalidCredentials,
} from '../../domain/errors/identity-access-errors';
import {
  LOGIN_ABUSE_PROTECTION,
  type ILoginAbuseProtection,
  type LoginAbuseFailureResult,
  type LoginAbusePrecheckResult,
} from '../../domain/ports/login-abuse-protection.port';
import { PASSWORD_HASHER, type IPasswordHasher } from '../../domain/ports/password-hasher.port';
import {
  SESSION_STORE,
  type ISessionStore,
  type SessionTokens,
} from '../../domain/ports/session-store.port';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type UserRecord,
} from '../../domain/ports/user-repository.port';
import { toUserRecord } from '../user-account.mapper';

@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
    @Inject(LOGIN_ABUSE_PROTECTION) private readonly loginAbuse: ILoginAbuseProtection,
  ) {}

  async execute(
    input: LoginInput,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ user: UserRecord; tokens: SessionTokens }> {
    if (meta.ip) {
      const precheck = await this.safePrecheck(input.email, meta.ip);
      if (precheck?.limitedScope) {
        this.logger.warn({
          event: 'auth.login.rate_limited',
          scope: precheck.limitedScope,
          sourceId: precheck.identifiers.ipId,
          accountId: precheck.identifiers.accountId,
        });
        throw new AuthRateLimited();
      }
    } else {
      this.logger.warn({ event: 'auth.login.client_ip_unavailable' });
    }

    const user = await this.users.findByEmail(input.email);
    if (!user) {
      const failure = meta.ip ? await this.safeRecordFailure(input.email, meta.ip) : null;
      this.logFailed(failure);
      throw new InvalidCredentials();
    }

    const passwordHash = user.assertCanPasswordLogin();
    const valid = await this.hasher.verify(passwordHash, input.password);
    if (!valid) {
      const failure = meta.ip ? await this.safeRecordFailure(input.email, meta.ip) : null;
      this.logFailed(failure);
      throw new InvalidCredentials();
    }

    if (meta.ip) await this.safeClearPair(input.email, meta.ip);
    const userRecord = toUserRecord(user);
    const tokens = await this.sessions.create(user.id, meta);
    return { user: userRecord, tokens };
  }

  private async safePrecheck(
    normalizedEmail: string,
    clientIp: string,
  ): Promise<LoginAbusePrecheckResult | null> {
    try {
      return await this.loginAbuse.precheck({ normalizedEmail, clientIp });
    } catch {
      this.logLimiterUnavailable('precheck');
      return null;
    }
  }

  private async safeRecordFailure(
    normalizedEmail: string,
    clientIp: string,
  ): Promise<LoginAbuseFailureResult | null> {
    try {
      const result = await this.loginAbuse.recordFailure({ normalizedEmail, clientIp });
      if (result.observationUnavailable) {
        this.logLimiterUnavailable('account_observation');
      }
      return result;
    } catch {
      this.logLimiterUnavailable('record_failure');
      return null;
    }
  }

  private async safeClearPair(normalizedEmail: string, clientIp: string): Promise<void> {
    try {
      await this.loginAbuse.clearPair({ normalizedEmail, clientIp });
    } catch {
      this.logLimiterUnavailable('clear_pair');
    }
  }

  private logFailed(failure: LoginAbuseFailureResult | null): void {
    this.logger.warn({
      event: 'auth.login.failed',
      ...(failure
        ? {
            sourceId: failure.identifiers.ipId,
            accountId: failure.identifiers.accountId,
          }
        : {}),
    });

    if (failure?.distributedAttack) {
      this.logger.warn({
        event: 'auth.login.distributed_attack_suspected',
        accountId: failure.identifiers.accountId,
        activeFailures: failure.distributedAttack.activeFailures,
        distinctSources: failure.distributedAttack.distinctSources,
      });
    }
  }

  private logLimiterUnavailable(
    operation: 'precheck' | 'record_failure' | 'clear_pair' | 'account_observation',
  ): void {
    this.logger.error({
      event: 'auth.login.limiter_unavailable',
      operation,
    });
  }
}
