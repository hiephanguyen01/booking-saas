const INTERNAL_ORIGIN = 'https://dashboard.invalid';

/**
 * Validates a `redirectTo` query value before it is used as a `redirect()`
 * target — an open-redirect guard for `/auth/login?redirectTo=…`. Only a
 * same-origin, single-leading-slash path survives; anything else (an absolute
 * URL, a protocol-relative `//host`, a backslash trick) falls back.
 * Mirrors `apps/storefront/app/lib/safe-redirect.ts` (no shared package
 * between the two apps for a five-line helper).
 */
export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  if (value.includes('\\') || /[\r\n\0]/.test(value)) return fallback;

  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN || target.username || target.password) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
