import { z } from 'zod';

/** Image types accepted for direct-to-storage uploads (§4.2). */
export const uploadContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);
export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

export const presignUploadInputSchema = z.object({
  /** Logical album the object belongs to. */
  target: z.enum(['listings', 'groups', 'partners', 'tenants']).default('listings'),
  contentType: uploadContentTypeSchema,
});
export type PresignUploadInput = z.infer<typeof presignUploadInputSchema>;

export interface PresignUploadResponse {
  /** PUT the bytes here with the same Content-Type. */
  uploadUrl: string;
  /** Persist this key on the listing/group `photos`. */
  key: string;
  /** URL the storefront serves the image from. */
  publicUrl: string;
  expiresInSec: number;
}
