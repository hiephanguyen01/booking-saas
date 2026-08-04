import { z } from 'zod';

/** Image types accepted for direct-to-storage uploads (§4.2). */
export const uploadContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  // .ico — tenant favicons only (kept in the same allowlist for simplicity).
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);
export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

/** Every MIME the backend will presign — the default `accept` for photo/logo/hero uploads. */
export const IMAGE_UPLOAD_ACCEPT: readonly UploadContentType[] = uploadContentTypeSchema.options;

/** Photo/logo/hero uploads exclude `.ico` (that format is favicon-only). */
export const PHOTO_UPLOAD_ACCEPT: readonly UploadContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
];

/** Favicons: raster images plus `.ico`. */
export const FAVICON_UPLOAD_ACCEPT: readonly UploadContentType[] = [
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/webp',
];

/** Default client-side max upload size, in megabytes (no server-side cap exists yet). */
export const MAX_UPLOAD_SIZE_MB = 5;

export const presignUploadInputSchema = z.object({
  /** Logical album the object belongs to. */
  target: z.enum(['listings', 'groups', 'partners', 'tenants', 'avatars']).default('listings'),
  contentType: uploadContentTypeSchema,
});
export type PresignUploadInput = z.infer<typeof presignUploadInputSchema>;

export const presignUploadResponseSchema = z.object({
  /** PUT the bytes here with the same Content-Type. */
  uploadUrl: z.string(),
  /** Persist this key on the listing/group `photos`. */
  key: z.string(),
  /** URL the storefront serves the image from. */
  publicUrl: z.string(),
  expiresInSec: z.number(),
});
export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>;
