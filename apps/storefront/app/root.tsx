import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { PublicListingTypeResponse } from '@booking/shared';
import type { Route } from './+types/root';
import { resolveTenant, type StorefrontTenant } from './lib/tenant.server';
import { fetchListingTypes } from './lib/catalog.server';
import { SiteHeader } from './components/site-header';
import { themeStyle } from './theme/theme';
import './app.css';

/** Shared route context: the resolved tenant + its auto-generated menu. */
export interface StorefrontContext {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
}

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
  const listingTypes = tenant.live ? await fetchListingTypes(request) : [];
  return { tenant, listingTypes };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.tenant.name ?? 'Booking' }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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

export default function App({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes } = loaderData;
  if (!tenant.live) {
    return (
      <div style={themeStyle(tenant.theme)} className="min-h-screen bg-(--sf-background)">
        <SuspendedNotice name={tenant.name} />
      </div>
    );
  }
  return (
    <div
      style={themeStyle(tenant.theme)}
      className="flex min-h-[100dvh] flex-col bg-(--sf-background) text-gray-900"
    >
      <SiteHeader tenant={tenant} listingTypes={listingTypes} />
      <main className="flex-1">
        <Outlet context={{ tenant, listingTypes } satisfies StorefrontContext} />
      </main>
      <footer className="mt-16 border-t border-black/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-sm text-(--sf-muted) sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold text-gray-900">{tenant.name}</span>
          <span>Nền tảng đặt chỗ · thanh toán an toàn · VND</span>
        </div>
      </footer>
    </div>
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
