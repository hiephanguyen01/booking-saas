/**
 * Route-module opt-in for a header that floats over the page's own artwork
 * instead of sitting on an opaque bar.
 *
 * Only the tenant home sets it today: its hero photo runs to the very top of the
 * document, and an opaque bar above it would cut the picture off. Any other page
 * that grows a full-bleed top image can opt in the same way — the shell keeps one
 * header, so the alternative would have been a second one.
 */
export interface SiteHeaderRouteHandle {
  overlayHeader?: boolean;
  /** A page-owned app bar below `md`; the shared tenant chrome stays unchanged above it. */
  mobileChrome?: 'search' | 'detail' | 'flow' | 'account';
  /** A route-owned sticky action occupies the bottom safe area. */
  hideBottomNav?: boolean;
}

/** Export this as a route module's `handle` to float the header over its hero. */
export const OVERLAY_HEADER_HANDLE: SiteHeaderRouteHandle = { overlayHeader: true };

export const HOME_HEADER_HANDLE: SiteHeaderRouteHandle = {
  overlayHeader: true,
};

export const SEARCH_MOBILE_CHROME_HANDLE: SiteHeaderRouteHandle = { mobileChrome: 'search' };

export const DETAIL_MOBILE_CHROME_HANDLE: SiteHeaderRouteHandle = { mobileChrome: 'detail' };

export const FLOW_MOBILE_CHROME_HANDLE: SiteHeaderRouteHandle = { mobileChrome: 'flow' };

export const ACCOUNT_MOBILE_CHROME_HANDLE: SiteHeaderRouteHandle = { mobileChrome: 'account' };

export const CHECKOUT_MOBILE_CHROME_HANDLE: SiteHeaderRouteHandle = {
  mobileChrome: 'flow',
  hideBottomNav: true,
};

export const BOOKING_DETAIL_MOBILE_CHROME_HANDLE: SiteHeaderRouteHandle = {
  mobileChrome: 'account',
  hideBottomNav: true,
};
