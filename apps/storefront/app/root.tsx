import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { BookingI18nProvider, type Locale } from '@booking/i18n';
import { QueryProvider } from '@booking/query';
import {
  data,
  isRouteErrorResponse,
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
import {
  readRefCode,
  refAttributionCookie,
  resolveVisitorId,
  trackReferral,
} from './lib/affiliate.server';
import { fetchListingTypes } from './lib/catalog.server';
import { resolveLocale } from './lib/i18n.server';
import { resolveTenant, type StorefrontTenant } from './lib/tenant.server';
import { themeCss } from './theme/theme';
import { canonicalUrl, localizedAlternates, requestPublicUrl } from './lib/seo';
import { storefrontAuthMiddleware } from './lib/auth-middleware.server';
import { getOptionalAuth } from './lib/auth.server';

export const middleware: Route.MiddlewareFunction[] = [storefrontAuthMiddleware];

/** Shared route context: the resolved tenant + its auto-generated menu + locale. */
export interface StorefrontContext {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  canonical: string;
  currentUser: CurrentUser | null;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
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
  const title = tenant.seo.title ?? tenant.name;
  const description = tenant.seo.description ?? undefined;
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
  if (tenant.hero.imageUrl) tags.push({ property: 'og:image', content: tenant.hero.imageUrl });
  return tags;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  const lang = data?.locale ?? 'vi';
  const favicon = data?.tenant?.faviconUrl ?? null;
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
function ThemeStyle({ theme }: { theme: StorefrontTenant['theme'] }) {
  return <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />;
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes, locale, canonical, currentUser } = loaderData;

  const matches = useMatches();

  const isStandalone = matches.some(
    (match) => (match.handle as { standalone?: boolean } | undefined)?.standalone,
  );

  if (!tenant.live) {
    return (
      <div className="min-h-screen bg-(--sf-background)">
        <ThemeStyle theme={tenant.theme} />
        <SuspendedNotice name={tenant.name} />
      </div>
    );
  }

  return (
    <BookingI18nProvider locale={locale}>
      <QueryProvider>
        <div className="flex min-h-dvh flex-col bg-(--sf-background) text-foreground">
          <ThemeStyle theme={tenant.theme} />
          {isStandalone ? (
            <Outlet
              context={
                { tenant, listingTypes, locale, canonical, currentUser } satisfies StorefrontContext
              }
            />
          ) : (
            <>
              <SiteHeader
                tenant={tenant}
                listingTypes={listingTypes}
                locale={locale}
                currentUser={currentUser}
              />
              <main className="flex-1">
                <Outlet
                  context={
                    {
                      tenant,
                      listingTypes,
                      locale,
                      canonical,
                      currentUser,
                    } satisfies StorefrontContext
                  }
                />
              </main>
              <SiteFooter tenant={tenant} />
            </>
          )}
        </div>
      </QueryProvider>
    </BookingI18nProvider>
  );
}

function SuspendedNotice({ name }: { name: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{name} tạm ngưng hoạt động</h1>
      <p className="text-muted-foreground">
        Trang đặt chỗ này hiện không khả dụng. Vui lòng liên hệ chủ cửa hàng để biết thêm chi tiết.
      </p>
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Đã có lỗi xảy ra';
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-2xl font-semibold">{message}</h1>
    </main>
  );
}
