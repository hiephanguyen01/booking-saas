import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { localeTranslator } from '~/lib/translator';
import { type Locale } from '@booking/i18n';
import { data } from 'react-router';
import type { AccountMenuSummary } from '~/features/account/lib/account-menu';
import {
  readRefCode,
  refAttributionCookie,
  resolveVisitorId,
  trackReferral,
} from '~/features/affiliate/server/affiliate.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { fetchListingTypes } from '~/features/catalog/server/catalog.server';
import { resolveLocale } from '~/lib/server/i18n.server';
import { getOptionalStorefrontTenant } from '~/lib/server/request-context.server';
import { canonicalUrl, localizedAlternates, requestPublicUrl } from '~/lib/seo';
import { storefrontEnv } from '~/lib/server/env.server';
import type { StorefrontTenant } from '~/lib/server/tenant.server';

export interface TenantRootLoaderPayload {
  kind: 'tenant';
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  canonical: string;
  alternates: ReturnType<typeof localizedAlternates>;
  cspNonce: string;
  currentUser: CurrentUser | null;
  accountMenuSummary: AccountMenuSummary | null;
}

export interface PlatformRootLoaderPayload {
  kind: 'platform';
  locale: Locale;
  canonical: string;
  alternates: ReturnType<typeof localizedAlternates>;
  cspNonce: string;
  dashboardLoginUrl: string;
  seo: {
    title: string;
    description: string;
  };
}

export type RootLoaderPayload = TenantRootLoaderPayload | PlatformRootLoaderPayload;

export async function loadStorefrontRoot(request: Request, routeUrl: URL, cspNonce: string) {
  const tenant = getOptionalStorefrontTenant();
  const locale = resolveLocale(request, tenant?.defaultLocale ?? 'vi');
  const publicUrl = requestPublicUrl(request, routeUrl);
  const canonical = canonicalUrl(publicUrl);
  const alternates = localizedAlternates(publicUrl);

  if (!tenant) {
    const { t } = localeTranslator(locale);
    const payload: PlatformRootLoaderPayload = {
      kind: 'platform',
      locale,
      canonical,
      alternates,
      cspNonce,
      dashboardLoginUrl: `${storefrontEnv.dashboardUrl}/auth/login`,
      seo: {
        title: t('platform.seo.title'),
        description: t('platform.seo.description'),
      },
    };
    return payload;
  }

  const storefrontAuth = getOptionalAuth();
  const currentUser = storefrontAuth?.info.user ?? null;
  const listingTypes = tenant.live ? await fetchListingTypes(request) : [];
  const payload: TenantRootLoaderPayload = {
    kind: 'tenant',
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
