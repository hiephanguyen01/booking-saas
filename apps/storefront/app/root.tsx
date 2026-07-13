import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import type { PublicListingTypeResponse } from '@booking/shared';
import type { Route } from './+types/root';
import { resolveTenant, type StorefrontTenant } from './lib/tenant.server';
import { fetchListingTypes } from './lib/catalog.server';
import { resolveLocale, messagesFor } from './lib/i18n.server';
import { createTranslator, I18nProvider, type Locale } from './lib/i18n';
import type { Messages } from './lib/messages';
import { SiteHeader } from './components/site-header';
import { SiteFooter } from './components/site-footer';
import { themeCss } from './theme/theme';
import './app.css';

/** Shared route context: the resolved tenant + its auto-generated menu + locale. */
export interface StorefrontContext {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
}

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
  const locale = resolveLocale(request, tenant.defaultLocale);
  const listingTypes = tenant.live ? await fetchListingTypes(request) : [];
  return { tenant, listingTypes, locale, messages: messagesFor(locale) };
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
  const favicon = data?.tenant?.logoUrl;
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
  const { tenant, listingTypes, locale, messages } = loaderData;
  const i18n = createTranslator(locale, messages as Messages);

  if (!tenant.live) {
    return (
      <div className="min-h-screen bg-(--sf-background)">
        <ThemeStyle theme={tenant.theme} />
        <SuspendedNotice name={tenant.name} />
      </div>
    );
  }
  return (
    <I18nProvider value={i18n}>
      <div className="flex min-h-dvh flex-col bg-(--sf-background) text-foreground">
        <ThemeStyle theme={tenant.theme} />
        <SiteHeader tenant={tenant} listingTypes={listingTypes} locale={locale} />
        <main className="flex-1">
          <Outlet context={{ tenant, listingTypes, locale } satisfies StorefrontContext} />
        </main>
        <SiteFooter tenant={tenant} />
      </div>
    </I18nProvider>
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
