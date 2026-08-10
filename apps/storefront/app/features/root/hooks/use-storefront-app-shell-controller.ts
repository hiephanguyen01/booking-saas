import { useState } from 'react';
import { useLocation, useMatches } from 'react-router';
import type { StorefrontContext } from '~/features/root/lib/storefront-context';
import type { TenantRootLoaderPayload } from '~/features/root/server/root-loader.server';
import type { SiteHeaderRouteHandle } from '~/features/site-shell/lib/site-header-handle';

export function useStorefrontAppShellController(loaderData: TenantRootLoaderPayload) {
  const { tenant, listingTypes, locale, canonical, cspNonce, currentUser, accountMenuSummary } =
    loaderData;
  // A document keeps the nonce it was rendered with even if the root loader
  // later revalidates and receives a nonce generated for a data request.
  const [documentNonce] = useState(cspNonce);
  const matches = useMatches();
  const location = useLocation();
  const mobileChrome = matches.reduce<SiteHeaderRouteHandle['mobileChrome']>(
    (active, match) => (match.handle as SiteHeaderRouteHandle | undefined)?.mobileChrome ?? active,
    undefined,
  );
  const isStandalone = matches.some(
    (match) => (match.handle as { standalone?: boolean } | undefined)?.standalone,
  );
  // Legal document pages (`routes/legal.tsx`) declare this so they keep
  // rendering their `<Outlet/>` even when `tenant.live` is false — otherwise
  // the request-security exemption alone is not enough: this shell would still
  // swap the whole route tree for `SuspendedNotice` and the document would
  // never actually render. See `request-security.server.ts`'s matching
  // `isLegalDocumentPath` exemption for the other half of this gate.
  const bypassTenantGate = matches.some(
    (match) => (match.handle as { bypassTenantGate?: boolean } | undefined)?.bypassTenantGate,
  );
  const hideBottomNav =
    matches.some((match) => (match.handle as SiteHeaderRouteHandle | undefined)?.hideBottomNav) ||
    (mobileChrome === 'flow' && new URLSearchParams(location.search).get('view') === 'detail');
  const outletContext: StorefrontContext = {
    tenant,
    listingTypes,
    locale,
    canonical,
    cspNonce: documentNonce,
    currentUser,
    accountMenuSummary,
  };

  return {
    accountMenuSummary,
    bypassTenantGate,
    currentUser,
    documentNonce,
    hideBottomNav,
    isStandalone,
    listingTypes,
    locale,
    mobileChrome,
    outletContext,
    tenant,
  };
}
