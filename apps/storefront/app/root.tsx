import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { BookingI18nProvider, type Locale } from '@booking/i18n';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { Button } from '@booking/ui/components/ui/button';
import {
  data,
  Link,
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
import type { AccountMenuSummary } from './features/account/account-menu';
import { getAccountMenuSummary } from './features/account/server/account-menu.server';
import { SiteFooter } from './layouts/site-footer';
import { SiteHeader } from './layouts/site-header';
import { TenantBrand } from './layouts/tenant-brand';
import {
  readRefCode,
  refAttributionCookie,
  resolveVisitorId,
  trackReferral,
} from './lib/affiliate.server';
import { getOptionalAuth } from './lib/auth.server';
import { fetchListingTypes } from './lib/catalog.server';
import { NsI18n, useTranslation } from './lib/i18n';
import { resolveLocale } from './lib/i18n.server';
import { storefrontPaths } from './lib/locale-paths';
import { getCurrentStorefrontTenant } from './lib/request-context.server';
import { storefrontRequestMiddleware } from './lib/request-security.server';
import { canonicalUrl, localizedAlternates, requestPublicUrl } from './lib/seo';
import type { StorefrontTenant } from './lib/tenant.server';
import { themeCss } from './theme/theme';

export const middleware: Route.MiddlewareFunction[] = [storefrontRequestMiddleware];

/** Shared route context: the resolved tenant + its auto-generated menu + locale. */
export interface StorefrontContext {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  canonical: string;
  currentUser: CurrentUser | null;
  accountMenuSummary: AccountMenuSummary | null;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const tenant = getCurrentStorefrontTenant();
  const locale = resolveLocale(request, tenant.defaultLocale);
  const publicUrl = requestPublicUrl(request, url);
  const canonical = canonicalUrl(publicUrl);
  const alternates = localizedAlternates(publicUrl);
  const listingTypes = tenant.live ? await fetchListingTypes(request) : [];
  const storefrontAuth = getOptionalAuth();
  const currentUser = storefrontAuth?.info.user ?? null;
  const accountMenuSummary = storefrontAuth
    ? await getAccountMenuSummary(request, storefrontAuth.session.accessToken)
    : null;
  const payload = {
    tenant,
    listingTypes,
    locale,
    canonical,
    alternates,
    currentUser,
    accountMenuSummary,
  };

  // Affiliate attribution (§15.1): capture `?ref=CODE` once per new code and set
  // the last-click cookie. Only track when the code differs from what's already
  // attributed, so repeat page views don't re-hit the backend.
  const ref = url.searchParams.get('ref')?.trim().toUpperCase();
  const attributedRef = await readRefCode(request, tenant.id);
  if (!ref || ref.length > 50 || attributedRef === ref) {
    return payload;
  }

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
  const { tenant, listingTypes, locale, canonical, currentUser, accountMenuSummary } = loaderData;

  const matches = useMatches();

  const isStandalone = matches.some(
    (match) => (match.handle as { standalone?: boolean } | undefined)?.standalone,
  );

  const outletContext: StorefrontContext = {
    tenant,
    listingTypes,
    locale,
    canonical,
    currentUser,
    accountMenuSummary,
  };

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
              accountMenuSummary={accountMenuSummary}
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
  const rootData = useRouteLoaderData<typeof loader>('root');

  if (isNotFoundError(error)) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#f9fafb] font-studio text-[#344054]">
        {rootData?.tenant ? (
          <>
            <ThemeStyle theme={rootData.tenant.themeConfig} />
            <header className="h-18 shrink-0">
              <div className="mx-auto flex h-full w-full max-w-292.5 items-center px-4 sm:px-6 xl:px-0">
                <Link
                  to={storefrontPaths.home(locale)}
                  aria-label={rootData.tenant.name}
                  className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TenantBrand
                    name={rootData.tenant.name}
                    logoUrl={rootData.tenant.themeConfig.logoUrl || null}
                    width={133}
                    height={40}
                  />
                </Link>
              </div>
            </header>
          </>
        ) : null}

        <main className="flex flex-1 justify-center px-4 pb-12 pt-8 sm:px-6 lg:pt-22">
          <section className="flex w-full max-w-125 flex-col items-center gap-6 text-center">
            <div className="flex w-full flex-col items-center">
              <img
                src="/booking-studio/404-illustration.png"
                alt=""
                width={500}
                height={500}
                className="aspect-square w-full object-contain"
              />
              <h1 className="w-full text-[28px] leading-10 font-semibold sm:text-[32px] sm:leading-12">
                {t('pageNotFound')}
              </h1>
            </div>

            <Button
              asChild
              className="h-12 rounded-sm bg-[#475467] px-5 text-base font-semibold text-white shadow-xs hover:bg-[#344054]"
            >
              <Link to={storefrontPaths.home(locale)}>{t('home')}</Link>
            </Button>
          </section>
        </main>
      </div>
    );
  }

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

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: unknown }).status === 404,
  );
}
