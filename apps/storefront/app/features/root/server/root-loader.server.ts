import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { data } from 'react-router';
import type { AccountMenuSummary } from '../../account/account-menu';
import {
  readRefCode,
  refAttributionCookie,
  resolveVisitorId,
  trackReferral,
} from '../../../lib/affiliate.server';
import { getOptionalAuth } from '../../../lib/auth.server';
import { fetchListingTypes } from '../../../lib/catalog.server';
import { resolveLocale } from '../../../lib/i18n.server';
import { getCurrentStorefrontTenant } from '../../../lib/request-context.server';
import { canonicalUrl, localizedAlternates, requestPublicUrl } from '../../../lib/seo';
import type { StorefrontTenant } from '../../../lib/tenant.server';

export interface RootLoaderPayload {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  canonical: string;
  alternates: ReturnType<typeof localizedAlternates>;
  cspNonce: string;
  currentUser: CurrentUser | null;
  accountMenuSummary: AccountMenuSummary | null;
}

export async function loadStorefrontRoot(request: Request, routeUrl: URL, cspNonce: string) {
  const tenant = getCurrentStorefrontTenant();
  const locale = resolveLocale(request, tenant.defaultLocale);
  const publicUrl = requestPublicUrl(request, routeUrl);
  const canonical = canonicalUrl(publicUrl);
  const alternates = localizedAlternates(publicUrl);
  const storefrontAuth = getOptionalAuth();
  const currentUser = storefrontAuth?.info.user ?? null;
  const listingTypes = tenant.live ? await fetchListingTypes(request) : [];
  const payload: RootLoaderPayload = {
    tenant,
    listingTypes,
    locale,
    canonical,
    alternates,
    cspNonce,
    currentUser,
    // Account-only counters are loaded by the account layout. Keeping the field
    // nullable preserves the public shell contract without an API call on every page.
    accountMenuSummary: null,
  };

  // Affiliate attribution (§15.1): capture `?ref=CODE` once per new code and set
  // the last-click cookie. Only track when the code differs from what's already
  // attributed, so repeat page views don't re-hit the backend.
  const ref = routeUrl.searchParams.get('ref')?.trim().toUpperCase();
  if (!ref || ref.length > 50) return payload;

  const attributedRef = await readRefCode(request, tenant.id);
  if (attributedRef === ref) return payload;

  const visitor = await resolveVisitorId(request);
  const valid = await trackReferral(request, ref, visitor.id);
  if (!valid) {
    // Still persist the visitor id if it was freshly minted.
    return visitor.setCookie
      ? data(payload, { headers: { 'Set-Cookie': visitor.setCookie } })
      : payload;
  }

  const headers = new Headers();
  headers.append('Set-Cookie', await refAttributionCookie(tenant.id, ref));
  if (visitor.setCookie) headers.append('Set-Cookie', visitor.setCookie);
  return data(payload, { headers });
}
