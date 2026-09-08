import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import type {
  ManualRefundPiiCryptoPort,
  ProtectedManualRefundAccount,
} from '../domain/ports/manual-refund-pii-crypto.port';

export interface ManualRefundPiiCryptoConfig {
  activeKeyVersion: string;
  keys: Readonly<Record<string, string>>;
  fingerprintKey: string;
}

const AAD_CONTEXT = 'bookingos:manual-refund-destination:v1';

function decode32ByteSecret(value: string, name: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(`${name} must be base64`);
  const secret = Buffer.from(value, 'base64');
  if (secret.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`);
  return secret;
}

function configFromEnvironment(): ManualRefundPiiCryptoConfig {
  const serialized = process.env.MANUAL_REFUND_PII_KEYRING;
  const activeKeyVersion = process.env.MANUAL_REFUND_PII_ACTIVE_KEY_VERSION?.trim();
  const fingerprintKey = process.env.MANUAL_REFUND_PII_FINGERPRINT_KEY;
  if (!serialized || !activeKeyVersion || !fingerprintKey) {
    throw new Error(
      'MANUAL_REFUND_PII_KEYRING, MANUAL_REFUND_PII_ACTIVE_KEY_VERSION and MANUAL_REFUND_PII_FINGERPRINT_KEY are required',
    );
  }
  let keys: unknown;
  try {
    keys = JSON.parse(serialized);
  } catch {
    throw new Error('MANUAL_REFUND_PII_KEYRING must be a JSON object');
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new Error('MANUAL_REFUND_PII_KEYRING must be a JSON object');
  }
  return { activeKeyVersion, keys: keys as Record<string, string>, fingerprintKey };
}

/** Dedicated, versioned AES-256-GCM protection for customer receiving-account PII. */
@Injectable()
export class AesGcmManualRefundPiiCryptoAdapter implements ManualRefundPiiCryptoPort {
  private resolved:
    | {
        activeKeyVersion: string;
        keys: ReadonlyMap<string, Buffer>;
        fingerprintKey: Buffer;
      }
    | undefined;

  constructor(@Optional() private readonly suppliedConfig?: ManualRefundPiiCryptoConfig) {}

  private secrets(): NonNullable<AesGcmManualRefundPiiCryptoAdapter['resolved']> {
    if (this.resolved) return this.resolved;
    const config = this.suppliedConfig ?? configFromEnvironment();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(config.activeKeyVersion)) {
      throw new Error('Manual refund PII active key version is invalid');
    }
    const keys = new Map(
      Object.entries(config.keys).map(([version, key]) => [
        version,
        decode32ByteSecret(key, `Manual refund PII key ${version}`),
      ]),
    );
    if (!keys.has(config.activeKeyVersion)) {
      throw new Error('Manual refund PII active key version is absent from the keyring');
    }
    this.resolved = {
      activeKeyVersion: config.activeKeyVersion,
      keys,
      fingerprintKey: decode32ByteSecret(
        config.fingerprintKey,
        'Manual refund PII fingerprint key',
      ),
    };
    return this.resolved;
  }

  protectAccountNumber(input: {
    tenantId: string;
    operationId: string;
    bankCode: string;
    accountNumber: string;
  }): ProtectedManualRefundAccount {
    const { activeKeyVersion, fingerprintKey } = this.secrets();
    const key = this.key(activeKeyVersion);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(input.tenantId, input.operationId));
    const encrypted = Buffer.concat([cipher.update(input.accountNumber, 'utf8'), cipher.final()]);
    const ciphertext = [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
    const fingerprint = createHmac('sha256', fingerprintKey)
      .update('bookingos:manual-refund-account-fingerprint:v1\0')
      .update(input.tenantId)
      .update('\0')
      .update(input.bankCode.trim().toUpperCase())
      .update('\0')
      .update(input.accountNumber)
      .digest('hex');
    return {
      ciphertext,
      keyVersion: activeKeyVersion,
      fingerprint,
      last4: input.accountNumber.slice(-4),
    };
  }

  decryptAccountNumber(input: {
    tenantId: string;
    operationId: string;
    keyVersion: string;
    ciphertext: string;
  }): string {
    const [ivBase64, tagBase64, encryptedBase64, ...extra] = input.ciphertext.split('.');
    if (!ivBase64 || !tagBase64 || !encryptedBase64 || extra.length) {
      throw new Error('Malformed manual refund PII ciphertext');
    }
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('Malformed manual refund PII ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key(input.keyVersion), iv);
    decipher.setAAD(this.aad(input.tenantId, input.operationId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(version: string): Buffer {
    const key = this.secrets().keys.get(version);
    if (!key) throw new Error(`Unknown manual refund PII key version: ${version}`);
    return key;
  }

  private aad(tenantId: string, operationId: string): Buffer {
    return Buffer.from(`${AAD_CONTEXT}\0${tenantId}\0${operationId}`, 'utf8');
  }
}
