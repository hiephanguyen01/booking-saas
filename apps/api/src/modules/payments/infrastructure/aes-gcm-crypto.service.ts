import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CryptoPort } from '../domain/ports/crypto.port';

const DEV_PAYMENTS_ENC_KEY = 'dev-payments-encryption-key-change-me';

function resolvePaymentsKey(): string {
  const key = process.env.PAYMENTS_ENC_KEY?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!key || key === DEV_PAYMENTS_ENC_KEY || key.length < 32) {
      throw new Error(
        'PAYMENTS_ENC_KEY must be configured with a secure secret of at least 32 characters in production',
      );
    }
    return key;
  }
  return key || DEV_PAYMENTS_ENC_KEY;
}

/**
 * AES-256-GCM for gateway credentials at rest (§11.1). The 32-byte key is
 * derived from `PAYMENTS_ENC_KEY` (env/KMS). Format: `iv.tag.ciphertext` (base64).
 */
@Injectable()
export class AesGcmCryptoService implements CryptoPort {
  private readonly cachedKey: Buffer;

  constructor() {
    this.cachedKey = createHash('sha256').update(resolvePaymentsKey()).digest();
  }

  private key(): Buffer {
    return this.cachedKey;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      enc.toString('base64'),
    ].join('.');
  }

  decrypt(ciphertext: string): string {
    const [ivB, tagB, encB] = ciphertext.split('.');
    if (!ivB || !tagB || !encB) throw new Error('Malformed ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }
}
