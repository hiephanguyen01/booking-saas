import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { BookingI18nProvider, type Locale } from '@booking/i18n';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
  useRouteLoaderData,
} from 'react-router';
import type { Route } from './+types/root';
import './app.css';
import { SiteFooter } from './layouts/site-footer';
import { SiteHeader } from './layouts/site-header';
import { NsI18n, useTranslation } from './lib/i18n';
import { storefrontPaths } from './lib/locale-paths';
import {
  readRefCode,
  refAttributionCookie,
  resolveVisitorId,
  trackReferral,
} from './lib/affiliate.server';
import { fetchListingTypes } from './lib/catalog.server';
import { resolveLocale } from './lib/i18n.server';
import { getCurrentStorefrontTenant } from './lib/request-context.server';
import type { StorefrontTenant } from './lib/tenant.server';
import { themeCss } from './theme/theme';
import { canonicalUrl, localizedAlternates, requestPublicUrl } from './lib/seo';
import { storefrontRequestMiddleware } from './lib/request-security.server';
import { getOptionalAuth } from './lib/auth.server';

export const middleware: Route.MiddlewareFunction[] = [storefrontRequestMiddleware];

/** Shared route context: the resolved tenant + its auto-generated menu + locale. */
export interface StorefrontContext {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  canonical: string;
  currentUser: CurrentUser | null;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const tenant = getCurrentStorefrontTenant();
  const locale = resolveLocale(request, tenant.defaultLocale);
  const publicUrl = requestPublicUrl(request, url);
  const canonical = canonicalUrl(publicUrl);
  const alternates = localizedAlternates(publicUrl);
  const listingTypes = tenant.live ? await fetchListingTypes(request) : [];
  const currentUser = getOptionalAuth()?.info.user ?? null;
  const payload = { tenant, listingTypes, locale, canonical, alternates, currentUser };

  // Affiliate attribution (§15.1): capture `?ref=CODE` once per new code and set
  // the last-click cookie. Only track when the code differs from what's already
  // attributed, so repeat page views don't re-hit the backend.
  const ref = url.searchParams.get('ref')?.trim().toUpperCase();
  if (!ref || ref.length > 50 || readRefCode(request, tenant.id) === ref) {
    return payload;
  }
  const visitor = resolveVisitorId(request);
  const valid = await trackReferral(request, ref, visitor.id);
  if (!valid) {
    // Still persist the visitor id if it was freshly minted.
    return visitor.setCookie
      ? data(payload, { headers: { 'Set-Cookie': visitor.setCookie } })
      : payload;
  }
  const headers = new Headers();
  headers.append('Set-Cookie', refAttributionCookie(tenant.id, ref));
  if (visitor.setCookie) headers.append('Set-Cookie', visitor.setCookie);
  return data(payload, { headers });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const tenant = loaderData?.tenant;
  if (!tenant) return [{ title: 'Booking' }];
  const title = tenant.themeConfig.seo?.title || tenant.name;
  const description = tenant.themeConfig.seo?.description || undefined;
  const tags: Array<Record<string, string>> = [
    { title },
    { property: 'og:title', content: title },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: tenant.name },
    { property: 'og:url', content: loaderData.canonical },
    { tagName: 'link', rel: 'canonical', href: loaderData.canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'vi', href: loaderData.alternates.vi },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: loaderData.alternates.en },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'x-default',
      href: loaderData.alternates.default,
    },
  ];
  if (description) {
    tags.push({ name: 'description', content: description });
    tags.push({ property: 'og:description', content: description });
  }
  if (tenant.themeConfig.hero?.imageUrl) {
    tags.push({ property: 'og:image', content: tenant.themeConfig.hero.imageUrl });
  }
  return tags;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  const lang = data?.locale ?? 'vi';
  const favicon = data?.tenant?.themeConfig.faviconUrl || null;
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {favicon ? <link rel="icon" href={favicon} /> : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** Per-tenant brand tokens, injected once at SSR so every UI component re-tints. */
function ThemeStyle({ theme }: { theme: StorefrontTenant['themeConfig'] }) {
  return <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />;
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes, locale, canonical, currentUser } = loaderData;

  const matches = useMatches();

  const isStandalone = matches.some(
    (match) => (match.handle as { standalone?: boolean } | undefined)?.standalone,
  );

  const outletContext: StorefrontContext = { tenant, listingTypes, locale, canonical, currentUser };

  return (
    <BookingI18nProvider locale={locale}>
      <div className="flex min-h-dvh flex-col bg-(--sf-background) text-foreground">
        <ThemeStyle theme={tenant.themeConfig} />
        {!tenant.live ? (
          <SuspendedNotice name={tenant.name} />
        ) : isStandalone ? (
          <Outlet context={outletContext} />
        ) : (
          <>
            <SiteHeader
              tenant={tenant}
              listingTypes={listingTypes}
              locale={locale}
              currentUser={currentUser}
            />
            <main className="flex-1">
              <Outlet context={outletContext} />
            </main>
            <SiteFooter tenant={tenant} />
          </>
        )}
      </div>
    </BookingI18nProvider>
  );
}

function SuspendedNotice({ name }: { name: string }) {
  const { t } = useTranslation(NsI18n.Error);
  return (
    <main className="mx-auto flex flex-1 max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('tenantSuspendedTitle', { tenant: name })}</h1>
      <p className="text-muted-foreground">{t('tenantSuspendedDescription')}</p>
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // The root loader may be what threw, so fall back to the default locale.
  const locale = useRouteLoaderData<typeof loader>('root')?.locale ?? 'vi';
  return (
    <BookingI18nProvider locale={locale}>
      <RootErrorNotice error={error} locale={locale} />
    </BookingI18nProvider>
  );
}

function RootErrorNotice({ error, locale }: { error: unknown; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Error);
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-background text-foreground">
      <RouteErrorState
        error={error}
        homeHref={storefrontPaths.home(locale)}
        homeLabel={t('home')}
      />
    </main>
  );
}
