import { isLocale, type Locale } from '@booking/i18n';
import { documentPathname } from './data-request.server';
import { storefrontEnv } from './env.server';

export { isLocale };

const COOKIE = 'sf_locale';

/**
 * Storefront locale (§18): the locale in the path wins, then the `sf_locale`
 * cookie, then the tenant's `default_locale`.
 *
 * The path is read through `documentPathname` because a client-side navigation
 * to `/en` arrives as `/en.data`. Without that, the first segment reads as
 * `en.data`, no locale is found, and the page renders in whatever the cookie
 * last said — which is how switching language could leave the URL on `/en` and
 * every word on the page in Vietnamese.
 */
export function resolveLocale(request: Request, fallback: Locale): Locale {
  const pathname = documentPathname(new URL(request.url).pathname);
  const pathLocale = pathname.split('/').filter(Boolean)[0];
  if (isLocale(pathLocale)) return pathLocale;
  const match = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)sf_locale=(vi|en)\b/);
  const cookieLocale = match?.[1];
  return isLocale(cookieLocale) ? cookieLocale : fallback;
}

/** `Set-Cookie` value for the language switcher (1 year, lax, path=/). */
export function localeCookie(locale: Locale): string {
  const secure = storefrontEnv.secureCookies ? '; Secure' : '';
  return `${COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`;
}

export function requireLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  throw new Response('Locale not found', { status: 404 });
}
