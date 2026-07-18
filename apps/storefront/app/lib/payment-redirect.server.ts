import { storefrontEnv } from './env.server';

/**
 * The local mock gateway returns a non-navigable `mock://pay/...` marker rather
 * than an external checkout page. It is only recognized in non-production so
 * callers can route back to Bookify's internal payment-status screen.
 */
export function isMockPaymentRedirect(value: unknown): boolean {
  if (storefrontEnv.production || !storefrontEnv.allowMockPayments || typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'mock:' && url.hostname === 'pay' && !url.username && !url.password;
  } catch {
    return false;
  }
}

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
