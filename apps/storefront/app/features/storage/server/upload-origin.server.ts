import { storefrontEnv } from '~/lib/server/env.server';

/**
 * Accept only presigned upload URLs whose origin is explicitly configured for
 * this storefront deployment. The full URL (including its signature query)
 * remains untouched after validation.
 */
export function allowedStorageUploadUrl(value: string): string | null {
  if (value !== value.trim()) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  if (!storefrontEnv.storageUploadOrigins.has(url.origin)) return null;
  return value;
}
