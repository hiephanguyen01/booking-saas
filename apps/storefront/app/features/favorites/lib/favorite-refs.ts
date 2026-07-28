import type { FavoriteRefsResponse } from '@booking/contracts';

export const EMPTY_FAVORITE_REFS: FavoriteRefsResponse = {
  listingIds: [],
  groupIds: [],
};

export function needsFavoriteRefs(pathname: string): boolean {
  if (pathname.endsWith('/booking-data')) return false;

  const relative = pathname.replace(/^\/(?:vi|en)(?=\/|$)/, '') || '/';
  return (
    relative === '/' ||
    /^\/(?:t|l|g|p)(?:\/|$)/.test(relative) ||
    relative === '/community' ||
    relative === '/account/favorites'
  );
}
