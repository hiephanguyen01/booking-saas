/**
 * Direct-to-storage image upload helper (TONG-QUAN.md §4.2).
 *
 * The backend exposes `POST /uploads/presign` (auth-only); a browser can't call it
 * directly (the auth token lives in an httpOnly cookie), so each frontend app
 * proxies it through a same-origin resource-route `action` that replays the cookie
 * server-side. This helper POSTs that proxy for a presigned PUT URL, then PUTs the
 * bytes straight to MinIO/S3 — the API never proxies file bytes.
 *
 * Kept dependency-free of `@booking/contracts` so `@booking/ui` stays self-contained;
 * the response shape mirrors `PresignUploadResponse` in that package.
 */

/** Storage album the object belongs to (mirrors `PresignUploadInput['target']`). */
export type UploadTarget = "listings" | "groups" | "partners" | "tenants"

/** Mirrors `PresignUploadResponse` from `@booking/contracts`. */
export interface PresignGrant {
  uploadUrl: string
  key: string
  publicUrl: string
  expiresInSec: number
}

export interface PresignAndPutOptions {
  /** Same-origin resource route proxying `POST /uploads/presign` (default `/uploads/presign`). */
  presignEndpoint?: string
  target: UploadTarget
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

/**
 * Presign then PUT a single file, returning the public URL to persist. Throws a
 * Vietnamese-message `Error` on any failure (surfaced by the uploader UI).
 */
export async function presignAndPut(
  file: File,
  { presignEndpoint = "/uploads/presign", target, signal }: PresignAndPutOptions,
): Promise<UploadedImage> {
  // 1) Ask our BFF (which holds the auth cookie) for a presigned PUT grant.
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

  // 2) PUT the bytes directly to storage — the URL is pre-signed, so no auth here.
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
  let value: unknown
  try {
    value = await res.json()
  } catch {
    throw new Error("Phản hồi liên kết tải lên không hợp lệ")
  }

  if (!value || typeof value !== "object") {
    throw new Error("Phản hồi liên kết tải lên không hợp lệ")
  }

  const grant = value as Record<string, unknown>
  if (
    !isNonEmptyString(grant.uploadUrl) ||
    !isNonEmptyString(grant.key) ||
    !isNonEmptyString(grant.publicUrl) ||
    typeof grant.expiresInSec !== "number" ||
    !Number.isFinite(grant.expiresInSec) ||
    grant.expiresInSec <= 0
  ) {
    throw new Error("Phản hồi liên kết tải lên không hợp lệ")
  }

  return grant as unknown as PresignGrant
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
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
