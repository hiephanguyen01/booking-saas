import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
  IssuedAuthChallenge,
  ResendChallengeResult,
  VerifyChallengeResult,
} from '../../domain/ports/auth-challenge-store.port';

const OTP_TTL_SEC = 10 * 60;
const RESEND_AFTER_SEC = 60;
const COMPLETION_TTL_SEC = 30 * 60;
const MAX_ATTEMPTS = 5;

interface StoredChallenge extends AuthChallengePayload {
  otpHash: string;
  attempts: number;
  resendAt: number;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const opaqueToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class RedisAuthChallengeStore implements IAuthChallengeStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private challengeKey(id: string) {
    return `identity:auth-challenge:${id}`;
  }

  private completionKey(token: string) {
    return `identity:auth-completion:${sha256(token)}`;
  }

  private async persist(
    challengeId: string,
    payload: AuthChallengePayload,
  ): Promise<IssuedAuthChallenge> {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const record: StoredChallenge = {
      ...payload,
      otpHash: sha256(otp),
      attempts: 0,
      resendAt: Date.now() + RESEND_AFTER_SEC * 1_000,
    };
    await this.redis.set(this.challengeKey(challengeId), JSON.stringify(record), 'EX', OTP_TTL_SEC);
    return {
      challengeId,
      otp,
      expiresInSec: OTP_TTL_SEC,
      resendAfterSec: RESEND_AFTER_SEC,
    };
  }

  issue(payload: AuthChallengePayload): Promise<IssuedAuthChallenge> {
    return this.persist(opaqueToken(), payload);
  }

  async resend(challengeId: string, purpose: AuthChallengePurpose): Promise<ResendChallengeResult> {
    const value = await this.redis.get(this.challengeKey(challengeId));
    if (!value) return { status: 'expired' };
    const record = JSON.parse(value) as StoredChallenge;
    if (record.purpose !== purpose) return { status: 'expired' };
    const retryAfterSec = Math.ceil((record.resendAt - Date.now()) / 1_000);
    if (retryAfterSec > 0) return { status: 'cooldown', retryAfterSec };
    const payload = this.payloadOf(record);
    return { status: 'issued', challenge: await this.persist(challengeId, payload), payload };
  }

  async verify(
    challengeId: string,
    purpose: AuthChallengePurpose,
    otp: string,
  ): Promise<VerifyChallengeResult> {
    const key = this.challengeKey(challengeId);
    const value = await this.redis.get(key);
    if (!value) return { status: 'expired' };
    const record = JSON.parse(value) as StoredChallenge;
    if (record.purpose !== purpose) return { status: 'expired' };

    const expected = Buffer.from(record.otpHash, 'hex');
    const actual = Buffer.from(sha256(otp), 'hex');
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      const completionToken = opaqueToken();
      await this.redis
        .multi()
        .del(key)
        .set(
          this.completionKey(completionToken),
          JSON.stringify(this.payloadOf(record)),
          'EX',
          COMPLETION_TTL_SEC,
        )
        .exec();
      return { status: 'verified', completionToken, expiresInSec: COMPLETION_TTL_SEC };
    }

    record.attempts += 1;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - record.attempts);
    if (attemptsRemaining === 0) {
      await this.redis.del(key);
      return { status: 'locked' };
    }
    const ttl = await this.redis.ttl(key);
    if (ttl <= 0) return { status: 'expired' };
    await this.redis.set(key, JSON.stringify(record), 'EX', ttl);
    return { status: 'invalid', attemptsRemaining };
  }

  async consumeCompletion(
    completionToken: string,
    purpose: AuthChallengePurpose,
  ): Promise<AuthChallengePayload | null> {
    const value = await this.redis.getdel(this.completionKey(completionToken));
    if (!value) return null;
    const payload = JSON.parse(value) as AuthChallengePayload;
    return payload.purpose === purpose ? payload : null;
  }

  private payloadOf(record: StoredChallenge): AuthChallengePayload {
    return {
      purpose: record.purpose,
      email: record.email,
      locale: record.locale,
      ...(record.fullName ? { fullName: record.fullName } : {}),
      ...(record.userId ? { userId: record.userId } : {}),
    };
  }
}
