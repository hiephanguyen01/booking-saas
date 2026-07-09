export const CRYPTO = Symbol('CRYPTO');

/** Symmetric encryption for gateway credentials at rest (AES-256-GCM, §11.1). */
export interface CryptoPort {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
