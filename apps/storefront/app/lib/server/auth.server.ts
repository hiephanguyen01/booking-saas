import type { Locale } from '@booking/i18n';
import { redirect } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { getCurrentStorefrontAuth } from './request-context.server';

export const getOptionalAuth = () => getCurrentStorefrontAuth();

/** Keeps signed-in customers out of entry-point auth pages. */
export function requireGuestAuth(locale: Locale): null {
  if (getOptionalAuth()) throw redirect(storefrontPaths.home(locale));
  return null;
}

export function requireAuth(redirectTo: string) {
  const auth = getOptionalAuth();
  if (!auth) throw redirect(redirectTo);
  return auth;
}
export const getOptionalAccessToken = () => getOptionalAuth()?.session.accessToken ?? null;

/**
 * The login redirect every authenticated customer surface sends anonymous
 * visitors to. Ten call sites built this by hand, in two silently different
 * forms — hence the explicit flag.
 *
 * `includeSearch` (the default) keeps the query string so a filtered or
 * paginated list survives the round trip. Actions pass `false`: an action URL's
 * query is not the page the customer returns to.
 */
export function requireCustomerAuth(
  request: Request,
  locale: Locale,
  { includeSearch = true }: { includeSearch?: boolean } = {},
) {
  const url = new URL(request.url);
  const returnTo = includeSearch ? `${url.pathname}${url.search}` : url.pathname;
  return requireAuth(storefrontPaths.login(locale, returnTo));
}
