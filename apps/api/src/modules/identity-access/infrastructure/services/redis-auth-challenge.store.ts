import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import {
  AuthChallenge,
  COMPLETION_TTL_SEC,
  OTP_TTL_SEC,
  RESEND_AFTER_SEC,
  type AuthChallengeState,
} from '../../domain/entities/auth-challenge.entity';
import type {
  AuthChallengePayload,
  AuthChallengePurpose,
  IAuthChallengeStore,
  IssuedAuthChallenge,
  ResendChallengeResult,
  VerifyChallengeResult,
} from '../../domain/ports/auth-challenge-store.port';

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

  private async issueWithId(
    challengeId: string,
    payload: AuthChallengePayload,
  ): Promise<IssuedAuthChallenge> {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = sha256(otp);
    const record = AuthChallenge.issue(payload, otpHash, Date.now());
    await this.redis.set(this.challengeKey(challengeId), JSON.stringify(record), 'EX', OTP_TTL_SEC);
    return this.issued(challengeId, otp);
  }

  issue(payload: AuthChallengePayload): Promise<IssuedAuthChallenge> {
    return this.issueWithId(opaqueToken(), payload);
  }

  async resend(challengeId: string, purpose: AuthChallengePurpose): Promise<ResendChallengeResult> {
    const value = await this.redis.get(this.challengeKey(challengeId));
    if (!value) return { status: 'expired' };
    const challenge = AuthChallenge.rehydrate(JSON.parse(value) as AuthChallengeState);
    if (challenge.purpose !== purpose) return { status: 'expired' };
    const decision = challenge.resendDecision(Date.now());
    if (decision.status === 'cooldown') return decision;

    const payload = challenge.payload();
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = sha256(otp);
    const replacement = challenge.resend(otpHash, Date.now());
    await this.redis.set(
      this.challengeKey(challengeId),
      JSON.stringify(replacement),
      'EX',
      OTP_TTL_SEC,
    );
    return { status: 'issued', challenge: this.issued(challengeId, otp), payload };
  }

  async verify(
    challengeId: string,
    purpose: AuthChallengePurpose,
    otp: string,
  ): Promise<VerifyChallengeResult> {
    const key = this.challengeKey(challengeId);
    const value = await this.redis.get(key);
    if (!value) return { status: 'expired' };
    const challenge = AuthChallenge.rehydrate(JSON.parse(value) as AuthChallengeState);
    if (challenge.purpose !== purpose) return { status: 'expired' };

    const expected = Buffer.from(challenge.otpHash, 'hex');
    const actual = Buffer.from(sha256(otp), 'hex');
    const otpMatches = expected.length === actual.length && timingSafeEqual(expected, actual);
    const transition = challenge.verify(otpMatches);
    if (transition.status === 'verified') {
      const completionToken = opaqueToken();
      await this.redis
        .multi()
        .del(key)
        .set(
          this.completionKey(completionToken),
          JSON.stringify(challenge.payload()),
          'EX',
          COMPLETION_TTL_SEC,
        )
        .exec();
      return { status: 'verified', completionToken, expiresInSec: COMPLETION_TTL_SEC };
    }

    if (transition.status === 'locked') {
      await this.redis.del(key);
      return { status: 'locked' };
    }
    const ttl = await this.redis.ttl(key);
    if (ttl <= 0) return { status: 'expired' };
    await this.redis.set(key, JSON.stringify(transition.state), 'EX', ttl);
    return { status: 'invalid', attemptsRemaining: transition.attemptsRemaining };
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

  private issued(challengeId: string, otp: string): IssuedAuthChallenge {
    return {
      challengeId,
      otp,
      expiresInSec: OTP_TTL_SEC,
      resendAfterSec: RESEND_AFTER_SEC,
    };
  }
}
