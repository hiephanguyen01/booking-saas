import { useMatches } from 'react-router';
import type { SiteHeaderRouteHandle } from '~/features/site-shell/lib/site-header-handle';

/** Keep every install surface scoped to routes that explicitly opt in. */
export function useShowPwaInstall(): boolean {
  const matches = useMatches();

  return matches.some(
    (match) => (match.handle as SiteHeaderRouteHandle | undefined)?.showPwaInstall === true,
  );
}
