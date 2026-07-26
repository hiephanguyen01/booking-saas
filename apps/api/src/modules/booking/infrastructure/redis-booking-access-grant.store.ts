import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.module';
import type {
  BookingAccessGrantScope,
  IBookingAccessGrantStore,
  IssuedBookingAccessGrant,
} from '../domain/ports/booking-access-grant-store.port';

const TTL_SEC = 30 * 60;
const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,256}$/;
const PREFIX = 'booking-access-grant:';

/** Stores only a SHA-256 lookup key; the bearer token itself never rests in Redis. */
@Injectable()
export class RedisBookingAccessGrantStore implements IBookingAccessGrantStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async issue(scope: BookingAccessGrantScope): Promise<IssuedBookingAccessGrant> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await this.redis.set(this.key(token), JSON.stringify(scope), 'EX', TTL_SEC);
    return { token, expiresInSec: TTL_SEC };
  }

  async verify(scope: BookingAccessGrantScope, token: string): Promise<boolean> {
    if (!TOKEN_RE.test(token)) return false;

    const key = this.key(token);
    const raw = await this.redis.get(key);
    if (!raw) return false;

    try {
      const stored = JSON.parse(raw) as Partial<BookingAccessGrantScope>;
      return (
        stored.tenantId === scope.tenantId &&
        stored.bookingId === scope.bookingId &&
        stored.bookingCode === scope.bookingCode
      );
    } catch {
      await this.redis.del(key);
      return false;
    }
  }

  async revoke(token: string): Promise<void> {
    if (!TOKEN_RE.test(token)) return;
    await this.redis.del(this.key(token));
  }

  private key(token: string): string {
    const digest = createHash('sha256').update(token).digest('hex');
    return `${PREFIX}${digest}`;
  }
}
