import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { SidebarInset, SidebarProvider } from '@booking/ui/components/ui/sidebar';
import { Toaster } from '@booking/ui/components/ui/sonner';
import { TooltipProvider } from '@booking/ui/components/ui/tooltip';
import { ThemeProvider } from '@booking/ui/components/theme/theme-provider';
import type { Route } from './+types/root';
import { loadSessionInfo } from './lib/auth.server';
import { dashboardAuthMiddleware } from './lib/auth-middleware.server';
import { AppSidebar } from './components/app-sidebar';
import { DashboardHeader } from './components/dashboard-header';
import { tenantBrandCss } from './lib/tenant-brand';
import { getCurrentDashboardHost } from './lib/request-auth.server';
import './app.css';

export const middleware: Route.MiddlewareFunction[] = [dashboardAuthMiddleware];

export function meta() {
  return [{ title: 'BookingOS Dashboard' }];
}

/**
 * The BookingOS platform mark — the same asset the storefront ships as its PWA
 * icon, so one brand covers both apps. Deliberately NOT the tenant's configured
 * favicon: the shell serves `/admin` and `/affiliate` too, where no tenant is in
 * scope, and a tab icon that changed with the area would read as a different app.
 */
export const links: Route.LinksFunction = () => [
  { rel: 'icon', type: 'image/png', href: '/icon-192.png' },
  { rel: 'apple-touch-icon', href: '/icon-192.png' },
];

/**
 * Root loader resolves the logged-in identity + scopes for the shell. It returns
 * `null` for anonymous visitors (login page) instead of redirecting, so auth
 * routes render outside the shell.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const info = await loadSessionInfo(request);
  return {
    info,
    host: getCurrentDashboardHost(),
    // The workspaces directory lives on the platform console, which is a different
    // origin from a tenant host — and a component may never read process.env.
    platformConsoleUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const info = loaderData?.info ?? null;
  const host = loaderData?.host ?? { kind: 'platform' as const };
  const hostTenant = host.kind === 'tenant' ? host.tenant : null;
  // The host is known before authentication (the Host header resolves it up
  // front), so the brand stylesheet is emitted above the anonymous early
  // return too — the sign-in screen on a tenant console host is branded.
  const brandCss = tenantBrandCss(hostTenant?.branding ?? null);

  // Unauthenticated (login/logout) — render the page without the dashboard shell.
  if (!info) {
    return (
      <>
        {brandCss ? <style dangerouslySetInnerHTML={{ __html: brandCss }} /> : null}
        <Outlet />
      </>
    );
  }

  return (
    <>
      {/* A document-level rule rather than a `style` prop on the shell: Radix
          portals every dropdown, dialog and the mobile sidebar to `document.body`,
          where an inline style on a wrapper can never reach them. */}
      {brandCss ? <style dangerouslySetInnerHTML={{ __html: brandCss }} /> : null}
      <SidebarProvider>
        <AppSidebar info={info} host={host} platformConsoleUrl={loaderData.platformConsoleUrl} />
        <SidebarInset className="min-w-0">
          <DashboardHeader />
          {hostTenant?.subscriptionExpired ? (
            <div
              role="status"
              className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground lg:px-6"
            >
              Gói dịch vụ đã hết hạn. Một số thao tác bị khoá cho đến khi bạn gia hạn.
            </div>
          ) : null}
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isResponse = isRouteErrorResponse(error);
  const title = isResponse ? `${error.status}` : 'Đã có lỗi xảy ra';
  const detail = isResponse
    ? typeof error.data === 'string' && error.data
      ? error.data
      : error.statusText
    : 'Vui lòng thử lại hoặc liên hệ quản trị viên.';

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{detail}</p>
    </main>
  );
}
