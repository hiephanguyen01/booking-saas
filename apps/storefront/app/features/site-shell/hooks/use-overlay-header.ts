import { useMatches } from 'react-router';
import type { SiteHeaderRouteHandle } from '~/features/site-shell/lib/site-header-handle';

/** True when any matched route asked for the header to float over its own hero. */
export function useOverlayHeader(): boolean {
  const matches = useMatches();
  return matches.some(
    (match) => (match.handle as SiteHeaderRouteHandle | undefined)?.overlayHeader === true,
  );
}
