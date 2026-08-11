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

/** A private object grant: callers persist only the opaque key, never a public URL. */
export type PrivatePresignedUpload = Omit<PresignedUpload, 'publicUrl'>;

/** A short-lived read grant for an object that must remain private at rest. */
export interface PrivatePresignedDownload {
  downloadUrl: string;
  expiresInSec: number;
}

export interface CreateUploadInput {
  /** Logical folder, e.g. `listings` or `groups` — sanitised by the adapter. */
  keyPrefix: string;
  /** MIME type the client will upload; the adapter restricts to images. */
  contentType: string;
  /** When supplied, the signed PUT must carry exactly this byte length. */
  contentLength?: number;
  /** Sign a conditional PUT so a captured URL cannot overwrite the first upload. */
  writeOnce?: boolean;
}

export interface PrivatePdfInspection {
  valid: boolean;
  reason?: 'not_found' | 'wrong_content_type' | 'too_large' | 'invalid_pdf';
  checksum: string;
  sizeBytes: number;
  contentType: string;
}

/**
 * Object storage abstraction (hexagonal port). The dev adapter targets MinIO;
 * prod swaps in S3/R2 with the same interface. Browsers upload directly via a
 * presigned URL — the API never proxies file bytes (§4.2).
 */
export interface StoragePort {
  createPresignedUpload(input: CreateUploadInput): Promise<PresignedUpload>;
  createPrivatePresignedUpload(input: CreateUploadInput): Promise<PrivatePresignedUpload>;
  createPrivatePresignedDownload(input: {
    key: string;
    fileName?: string;
  }): Promise<PrivatePresignedDownload>;
  inspectPrivatePdf(input: { key: string; maxSizeBytes: number }): Promise<PrivatePdfInspection>;
  deletePrivateObject(key: string): Promise<void>;
  /** Resolve a validated object key to the public CDN/MinIO URL persisted by domain records. */
  publicUrlForKey(key: string): string;
}
