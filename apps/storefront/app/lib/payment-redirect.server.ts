import { storefrontEnv } from './env.server';
import type { CheckoutDestination } from '@booking/contracts';

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

/** Validate a provider form handoff before any signed fields reach browser HTML. */
export function allowedPaymentFormPost(
  value: CheckoutDestination,
): Extract<CheckoutDestination, { type: 'form_post' }> | null {
  if (value.type !== 'form_post') return null;
  const actionUrl = allowedPaymentRedirect(value.actionUrl);
  if (!actionUrl) return null;
  const entries = Object.entries(value.fields);
  if (entries.length === 0 || entries.length > 40) return null;
  if (
    entries.some(
      ([name, fieldValue]) =>
        !/^[a-z][a-z0-9_]{0,63}$/i.test(name) ||
        typeof fieldValue !== 'string' ||
        fieldValue.length > 2_000,
    )
  ) {
    return null;
  }
  return { type: 'form_post', actionUrl, fields: Object.fromEntries(entries) };
}
