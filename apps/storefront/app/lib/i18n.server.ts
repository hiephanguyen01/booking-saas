import type { Locale } from '@booking/i18n';
import { storefrontEnv } from './env.server';
const COOKIE = 'sf_locale';

/**
 * Storefront locale (§18): a `sf_locale` cookie set by the switcher wins;
 * otherwise fall back to the tenant's `default_locale`.
 */
export function resolveLocale(request: Request, fallback: Locale): Locale {
  const pathLocale = new URL(request.url).pathname.split('/').filter(Boolean)[0];
  if (pathLocale === 'vi' || pathLocale === 'en') return pathLocale;
  const match = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)sf_locale=(vi|en)\b/);
  return match ? (match[1] as Locale) : fallback;
}

/** `Set-Cookie` value for the language switcher (1 year, lax, path=/). */
export function localeCookie(locale: Locale): string {
  const secure = storefrontEnv.secureCookies ? '; Secure' : '';
  return `${COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`;
}

export function isLocale(value: unknown): value is Locale {
  return value === 'vi' || value === 'en';
}
