export const MANUAL_REFUND_PII_CRYPTO = Symbol('MANUAL_REFUND_PII_CRYPTO');

export interface ProtectedManualRefundAccount {
  readonly ciphertext: string;
  readonly keyVersion: string;
  readonly fingerprint: string;
  readonly last4: string;
}

export interface ManualRefundPiiCryptoPort {
  protectAccountNumber(input: {
    tenantId: string;
    operationId: string;
    bankCode: string;
    accountNumber: string;
  }): ProtectedManualRefundAccount;
  decryptAccountNumber(input: {
    tenantId: string;
    operationId: string;
    keyVersion: string;
    ciphertext: string;
  }): string;
}
