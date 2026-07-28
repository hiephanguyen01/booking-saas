import { useState } from 'react';
import { useMatches } from 'react-router';
import type { TenantRootLoaderPayload } from '../server/root-loader.server';
import type { StorefrontContext } from '../storefront-context';

export function useStorefrontAppShellController(loaderData: TenantRootLoaderPayload) {
  const { tenant, listingTypes, locale, canonical, cspNonce, currentUser, accountMenuSummary } =
    loaderData;
  // A document keeps the nonce it was rendered with even if the root loader
  // later revalidates and receives a nonce generated for a data request.
  const [documentNonce] = useState(cspNonce);
  const matches = useMatches();
  const isStandalone = matches.some(
    (match) => (match.handle as { standalone?: boolean } | undefined)?.standalone,
  );
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
    currentUser,
    documentNonce,
    isStandalone,
    listingTypes,
    locale,
    outletContext,
    tenant,
  };
}
