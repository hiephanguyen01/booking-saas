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
}

/** Export this as a route module's `handle` to float the header over its hero. */
export const OVERLAY_HEADER_HANDLE: SiteHeaderRouteHandle = { overlayHeader: true };
