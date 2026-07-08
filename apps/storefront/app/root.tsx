import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import { resolveTenant } from './lib/tenant.server';
import { themeStyle } from './theme/theme';
import './app.css';

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
  return { tenant };
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
  return (
    <div style={themeStyle(loaderData.tenant.theme)} className="min-h-screen bg-(--sf-background)">
      <Outlet context={loaderData.tenant} />
    </div>
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
