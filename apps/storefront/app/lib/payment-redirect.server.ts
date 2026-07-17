import { storefrontEnv } from './env.server';

export function allowedPaymentRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (storefrontEnv.production && url.protocol !== 'https:') return null;
  if (!storefrontEnv.paymentRedirectOrigins.has(url.origin)) return null;
  return url.toString();
}
