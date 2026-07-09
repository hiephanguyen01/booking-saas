export const STORAGE_PORT = Symbol('STORAGE_PORT');

/** A short-lived direct-to-storage upload grant (§4.2 — presigned URL). */
export interface PresignedUpload {
  /** PUT the file bytes here (with the same Content-Type). */
  uploadUrl: string;
  /** The object key to persist in the DB (`photos` jsonb). */
  key: string;
  /** The URL the storefront/CDN serves the object from. */
  publicUrl: string;
  expiresInSec: number;
}

export interface CreateUploadInput {
  /** Logical folder, e.g. `listings` or `groups` — sanitised by the adapter. */
  keyPrefix: string;
  /** MIME type the client will upload; the adapter restricts to images. */
  contentType: string;
}

/**
 * Object storage abstraction (hexagonal port). The dev adapter targets MinIO;
 * prod swaps in S3/R2 with the same interface. Browsers upload directly via a
 * presigned URL — the API never proxies file bytes (§4.2).
 */
export interface StoragePort {
  createPresignedUpload(input: CreateUploadInput): Promise<PresignedUpload>;
}
