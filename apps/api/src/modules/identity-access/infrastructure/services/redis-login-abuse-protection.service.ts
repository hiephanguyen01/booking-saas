import type { OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS } from '../../../../shared/redis/redis.module';
import type {
  ILoginAbuseProtection,
  LoginAbuseFailureResult,
  LoginAbuseIdentifiers,
  LoginAbusePrecheckResult,
} from '../../domain/ports/login-abuse-protection.port';

const WINDOW_MS = 10 * 60 * 1_000;
const KEY_TTL_MS = WINDOW_MS * 2;
const PAIR_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 30;
const ACCOUNT_OBSERVE_LIMIT = 20;
const ACCOUNT_DISTINCT_SOURCE_LIMIT = 3;
const COMMAND_TIMEOUT_MS = 750;
const DEV_HMAC_KEY = 'dev-auth-rate-limit-hmac-key-not-for-production';

const PRECHECK_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
local pairCount = redis.call('ZCARD', KEYS[1])
local ipCount = redis.call('ZCARD', KEYS[2])
if pairCount >= tonumber(ARGV[2]) then return 1 end
if ipCount >= tonumber(ARGV[3]) then return 2 end
return 0
`;

const RECORD_BLOCKING_FAILURE_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
local member = tostring(now) .. ':' .. ARGV[2]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, member)
redis.call('ZADD', KEYS[2], now, member)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]))
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[3]))
return { redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[2]) }
`;

const RECORD_OBSERVATION_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
local eventMember = tostring(now) .. ':' .. ARGV[2]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, eventMember)
redis.call('ZADD', KEYS[2], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]))
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[4]))
return { redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[2]) }
`;

function loadHmacKey(): string {
  const key = process.env.AUTH_RATE_LIMIT_HMAC_KEY?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!key || key.length < 32 || key === DEV_HMAC_KEY || key.startsWith('CHANGE_ME')) {
      throw new Error(
        'AUTH_RATE_LIMIT_HMAC_KEY must be a unique secret of at least 32 characters in production',
      );
    }
    return key;
  }
  return key || DEV_HMAC_KEY;
}

function toNumber(value: unknown, operation: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid Redis result for ${operation}`);
  return number;
}

@Injectable()
export class RedisLoginAbuseProtectionService
  implements ILoginAbuseProtection, OnApplicationShutdown
{
  private readonly redis: Redis;
  private readonly secret: string;

  constructor(@Inject(REDIS) sharedRedis: Redis) {
    this.secret = loadHmacKey();
    this.redis = sharedRedis.duplicate({
      connectionName: 'auth-login-abuse',
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: COMMAND_TIMEOUT_MS,
    });
    this.redis.on('error', () => undefined);
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }

  async precheck(input: {
    normalizedEmail: string;
    clientIp: string;
  }): Promise<LoginAbusePrecheckResult> {
    const identifiers = this.identifiers(input);
    const result = await this.redis.eval(
      PRECHECK_SCRIPT,
      2,
      this.pairKey(identifiers.pairId),
      this.ipKey(identifiers.ipId),
      String(WINDOW_MS),
      String(PAIR_FAILURE_LIMIT),
      String(IP_FAILURE_LIMIT),
    );
    const limited = toNumber(result, 'login abuse precheck');
    return {
      identifiers,
      limitedScope: limited === 1 ? 'pair' : limited === 2 ? 'ip' : null,
    };
  }

  async recordFailure(input: {
    normalizedEmail: string;
    clientIp: string;
  }): Promise<LoginAbuseFailureResult> {
    const identifiers = this.identifiers(input);

    const blockingResult = await this.redis.eval(
      RECORD_BLOCKING_FAILURE_SCRIPT,
      2,
      this.pairKey(identifiers.pairId),
      this.ipKey(identifiers.ipId),
      String(WINDOW_MS),
      randomUUID(),
      String(KEY_TTL_MS),
    );
    if (!Array.isArray(blockingResult) || blockingResult.length !== 2) {
      throw new Error('Invalid Redis result for login abuse failure recording');
    }
    toNumber(blockingResult[0], 'login abuse pair failure recording');
    toNumber(blockingResult[1], 'login abuse ip failure recording');

    try {
      const observationResult = await this.redis.eval(
        RECORD_OBSERVATION_SCRIPT,
        2,
        this.accountObservationEventsKey(identifiers.accountId),
        this.accountObservationSourcesKey(identifiers.accountId),
        String(WINDOW_MS),
        randomUUID(),
        identifiers.ipId,
        String(KEY_TTL_MS),
      );
      if (!Array.isArray(observationResult) || observationResult.length !== 2) {
        throw new Error('Invalid Redis result for login account observation');
      }
      const activeFailures = toNumber(observationResult[0], 'login account observation failures');
      const distinctSources = toNumber(
        observationResult[1],
        'login account observation distinct sources',
      );
      return {
        identifiers,
        distributedAttack:
          activeFailures >= ACCOUNT_OBSERVE_LIMIT &&
          distinctSources >= ACCOUNT_DISTINCT_SOURCE_LIMIT
            ? { activeFailures, distinctSources }
            : null,
        observationUnavailable: false,
      };
    } catch {
      return {
        identifiers,
        distributedAttack: null,
        observationUnavailable: true,
      };
    }
  }

  async clearPair(input: { normalizedEmail: string; clientIp: string }): Promise<void> {
    const identifiers = this.identifiers(input);
    await this.redis.del(this.pairKey(identifiers.pairId));
  }

  private identifiers(input: {
    normalizedEmail: string;
    clientIp: string;
  }): LoginAbuseIdentifiers {
    return {
      pairId: this.hmac(`pair\0${input.clientIp}\0${input.normalizedEmail}`),
      ipId: this.hmac(`ip\0${input.clientIp}`),
      accountId: this.hmac(`email\0${input.normalizedEmail}`),
    };
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  private pairKey(pairId: string): string {
    return `auth:login:pair:${pairId}`;
  }

  private ipKey(ipId: string): string {
    return `auth:login:ip:${ipId}`;
  }

  private accountObservationEventsKey(accountId: string): string {
    return `auth:login:account-observe:${accountId}:events`;
  }

  private accountObservationSourcesKey(accountId: string): string {
    return `auth:login:account-observe:${accountId}:sources`;
  }
}
