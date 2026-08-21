/**
 * Direct-to-storage upload helpers (TONG-QUAN.md §4.2).
 *
 * Browser code posts to a same-origin BFF resource route, receives a presigned
 * storage grant, then PUTs file bytes directly to MinIO/S3. The API never proxies
 * file bytes. This package deliberately stays dependency-free of
 * `@booking/contracts`; response interfaces below mirror the wire contracts.
 */

/** Storage album the object belongs to (mirrors `PresignUploadInput['target']`). */
export type UploadTarget = "listings" | "groups" | "partners" | "tenants" | "avatars"

/** Mirrors `PresignUploadResponse` from `@booking/contracts`. */
export interface PresignGrant {
  uploadUrl: string
  key: string
  publicUrl: string
  expiresInSec: number
}

/** Mirrors the dedicated private partner-document grant. */
interface PrivateDocumentPresignGrant {
  uploadUrl: string
  key: string
  expiresInSec: number
  requiredHeaders: {
    "content-type": string
    "if-none-match": "*"
  }
}

export interface PresignAndPutOptions {
  /** Same-origin resource route proxying `POST /uploads/presign` (default `/uploads/presign`). */
  presignEndpoint?: string
  target: UploadTarget
  signal?: AbortSignal
}

export interface PrivateDocumentUploadOptions {
  presignEndpoint: string
  signal?: AbortSignal
}

export interface UploadedImage {
  /** URL the storefront/CDN serves the image from — persist this on the model. */
  publicUrl: string
  /** Raw storage object key. */
  key: string
}

export interface UploadedReviewMedia {
  key: string
}

export interface UploadedPrivateDocument {
  /** Opaque private object key. Persist this, never the presigned URL. */
  key: string
}

/**
 * Presign then PUT a single public file, returning the public URL to persist.
 */
export async function presignAndPut(
  file: File,
  { presignEndpoint = "/uploads/presign", target, signal }: PresignAndPutOptions,
): Promise<UploadedImage> {
  const presignRes = await fetch(presignEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ target, contentType: file.type }),
    signal,
  })
  if (!presignRes.ok) {
    throw new Error(
      (await safeMessage(presignRes)) ?? `Không thể tạo liên kết tải lên (${presignRes.status})`,
    )
  }
  const grant = await readPresignGrant(presignRes)

  const putRes = await fetch(grant.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
    signal,
  })
  if (!putRes.ok) {
    throw new Error(`Tải tệp lên thất bại (${putRes.status})`)
  }

  return { publicUrl: grant.publicUrl, key: grant.key }
}

/**
 * Presign and PUT one private partner identity/legal document. The caller persists
 * only the returned object key. `Content-Length` is intentionally absent here:
 * browsers own that header and compute it from the exact `File` body; the server
 * signs the expected byte count supplied in the presign request.
 */
export async function presignAndPutPrivateDocument(
  file: File,
  { presignEndpoint, signal }: PrivateDocumentUploadOptions,
): Promise<UploadedPrivateDocument> {
  const presignRes = await fetch(presignEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
    signal,
  })
  if (!presignRes.ok) {
    throw new Error(
      (await safeMessage(presignRes)) ?? `Không thể tạo liên kết tải lên (${presignRes.status})`,
    )
  }

  const grant = await readPrivateDocumentGrant(presignRes)
  if (grant.requiredHeaders["content-type"] !== file.type) {
    throw new Error("Phản hồi tải tài liệu không khớp loại tệp")
  }

  const putRes = await fetch(grant.uploadUrl, {
    method: "PUT",
    headers: grant.requiredHeaders,
    body: file,
    signal,
  })
  if (!putRes.ok) {
    throw new Error(`Tải tài liệu lên thất bại (${putRes.status})`)
  }

  return { key: grant.key }
}

/**
 * Upload one booking-scoped review image/video through the Storefront BFF.
 * Validation and size limits remain owned by the shared review contract/API;
 * this low-level helper only transports the typed browser File.
 */
export async function presignAndPutReviewMedia(
  file: File,
  bookingId: string,
  { presignEndpoint = "/uploads/reviews/presign", signal }: Pick<PresignAndPutOptions, "presignEndpoint" | "signal"> = {},
): Promise<UploadedReviewMedia> {
  const presignRes = await fetch(presignEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ bookingId, contentType: file.type, sizeBytes: file.size }),
    signal,
  })
  if (!presignRes.ok) {
    throw new Error(
      (await safeMessage(presignRes)) ?? `Không thể tạo liên kết tải lên (${presignRes.status})`,
    )
  }
  const grant = await readPresignGrant(presignRes)

  const putRes = await fetch(grant.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
    signal,
  })
  if (!putRes.ok) throw new Error(`Tải tệp lên thất bại (${putRes.status})`)
  return { key: grant.key }
}

async function readPresignGrant(res: Response): Promise<PresignGrant> {
  const grant = await readObject(res)
  if (
    !isNonEmptyString(grant.uploadUrl) ||
    !isNonEmptyString(grant.key) ||
    !isNonEmptyString(grant.publicUrl) ||
    !isPositiveFiniteNumber(grant.expiresInSec)
  ) {
    throw new Error("Phản hồi liên kết tải lên không hợp lệ")
  }

  return {
    uploadUrl: grant.uploadUrl,
    key: grant.key,
    publicUrl: grant.publicUrl,
    expiresInSec: grant.expiresInSec,
  }
}

async function readPrivateDocumentGrant(res: Response): Promise<PrivateDocumentPresignGrant> {
  const grant = await readObject(res)
  const headers = grant.requiredHeaders
  if (
    !isNonEmptyString(grant.uploadUrl) ||
    !isNonEmptyString(grant.key) ||
    !isPositiveFiniteNumber(grant.expiresInSec) ||
    !headers ||
    typeof headers !== "object"
  ) {
    throw new Error("Phản hồi tải tài liệu không hợp lệ")
  }

  const requiredHeaders = headers as Record<string, unknown>
  if (
    !isNonEmptyString(requiredHeaders["content-type"]) ||
    requiredHeaders["if-none-match"] !== "*"
  ) {
    throw new Error("Phản hồi tải tài liệu không hợp lệ")
  }

  return {
    uploadUrl: grant.uploadUrl,
    key: grant.key,
    expiresInSec: grant.expiresInSec,
    requiredHeaders: {
      "content-type": requiredHeaders["content-type"],
      "if-none-match": "*",
    },
  }
}

async function readObject(res: Response): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await res.json()
  } catch {
    throw new Error("Phản hồi liên kết tải lên không hợp lệ")
  }
  if (!value || typeof value !== "object") {
    throw new Error("Phản hồi liên kết tải lên không hợp lệ")
  }
  return value as Record<string, unknown>
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

async function safeMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body?.message === "string") return body.message
  } catch {
    /* non-JSON error body — fall through to the default message */
  }
  return undefined
}
