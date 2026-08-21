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
local cutoff = tonumber(ARGV[1])
local pairLimit = tonumber(ARGV[2])
local ipLimit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
local pairCount = redis.call('ZCARD', KEYS[1])
local ipCount = redis.call('ZCARD', KEYS[2])
if pairCount >= pairLimit then return 1 end
if ipCount >= ipLimit then return 2 end
return 0
`;

const RECORD_BLOCKING_FAILURE_SCRIPT = `
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local member = ARGV[3]
local ttl = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, member)
redis.call('ZADD', KEYS[2], now, member)
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', KEYS[2], ttl)
return { redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[2]) }
`;

const RECORD_OBSERVATION_SCRIPT = `
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local member = ARGV[3]
local ttl = tonumber(ARGV[4])
local threshold = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], ttl)
local active = redis.call('ZCARD', KEYS[1])
if active < threshold then return { active, 0 } end
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
local sources = {}
local distinct = 0
for _, value in ipairs(members) do
  local separator = string.find(value, ':', 1, true)
  local source = separator and string.sub(value, 1, separator - 1) or value
  if not sources[source] then
    sources[source] = true
    distinct = distinct + 1
  end
end
return { active, distinct }
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
    const now = Date.now();
    const result = await this.redis.eval(
      PRECHECK_SCRIPT,
      2,
      this.pairKey(identifiers.pairId),
      this.ipKey(identifiers.ipId),
      String(now - WINDOW_MS),
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
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const member = `${now}:${randomUUID()}`;

    const blockingResult = await this.redis.eval(
      RECORD_BLOCKING_FAILURE_SCRIPT,
      2,
      this.pairKey(identifiers.pairId),
      this.ipKey(identifiers.ipId),
      String(now),
      String(cutoff),
      member,
      String(KEY_TTL_MS),
    );
    if (!Array.isArray(blockingResult) || blockingResult.length !== 2) {
      throw new Error('Invalid Redis result for login abuse failure recording');
    }
    toNumber(blockingResult[0], 'login abuse pair failure recording');
    toNumber(blockingResult[1], 'login abuse ip failure recording');

    try {
      const observationMember = `${identifiers.ipId}:${randomUUID()}`;
      const observationResult = await this.redis.eval(
        RECORD_OBSERVATION_SCRIPT,
        1,
        this.accountObservationKey(identifiers.accountId),
        String(now),
        String(cutoff),
        observationMember,
        String(KEY_TTL_MS),
        String(ACCOUNT_OBSERVE_LIMIT),
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

  private accountObservationKey(accountId: string): string {
    return `auth:login:account-observe:${accountId}`;
  }
}
