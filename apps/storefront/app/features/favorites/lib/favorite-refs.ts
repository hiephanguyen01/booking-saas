import type { FavoriteRefsResponse } from '@booking/contracts';

export const EMPTY_FAVORITE_REFS: FavoriteRefsResponse = {
  listingIds: [],
  groupIds: [],
};

/**
 * Route shapes are matched locale-stripped, so these are path *suffixes* rather
 * than entries in `storefrontPaths` (which always carry a `/:locale` prefix).
 * They are route paths, not backend endpoints — do not reach for `apiPaths`.
 */
const FAVOURITE_BEARING_PATHS = new Set([
  '/',
  '/community',
  '/account/favorites',
  '/account/recent',
]);
const DETAIL_PATH_RE = /^\/(?:t|l|g|p)(?:\/|$)/;

export function needsFavoriteRefs(pathname: string): boolean {
  if (pathname.endsWith('/booking-data')) return false;

  const relative = pathname.replace(/^\/(?:vi|en)(?=\/|$)/, '') || '/';
  return FAVOURITE_BEARING_PATHS.has(relative) || DETAIL_PATH_RE.test(relative);
}
