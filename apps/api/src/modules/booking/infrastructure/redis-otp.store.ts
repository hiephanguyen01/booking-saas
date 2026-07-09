import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.module';
import type { IOtpStore } from '../domain/ports/otp-store.port';

const TTL_SEC = 600; // 10-minute OTP

/** Email-OTP store (§8.6). The code is stored hashed and consumed on success. */
@Injectable()
export class RedisOtpStore implements IOtpStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(bookingCode: string): string {
    return `booking-otp:${bookingCode}`;
  }

  private hash(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  async issue(bookingCode: string): Promise<{ otp: string; expiresInSec: number }> {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.set(this.key(bookingCode), this.hash(otp), 'EX', TTL_SEC);
    return { otp, expiresInSec: TTL_SEC };
  }

  async verify(bookingCode: string, otp: string): Promise<boolean> {
    const key = this.key(bookingCode);
    const stored = await this.redis.get(key);
    if (!stored || stored !== this.hash(otp)) return false;
    await this.redis.del(key); // single-use
    return true;
  }
}
