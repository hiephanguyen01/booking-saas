import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from 'react-router';
import { SidebarInset, SidebarProvider } from '@booking/ui/components/ui/sidebar';
import { Toaster } from '@booking/ui/components/ui/sonner';
import { ThemeProvider } from '@booking/ui/components/theme/theme-provider';
import type { Route } from './+types/root';
import { loadSessionInfo } from './lib/auth.server';
import { dashboardAuthMiddleware } from './lib/auth-middleware.server';
import { AppSidebar } from './components/app-sidebar';
import { DashboardHeader } from './components/dashboard-header';
import { activeTenantMembership, tenantBrandStyle } from './lib/tenant-brand';
import './app.css';

export const middleware: Route.MiddlewareFunction[] = [dashboardAuthMiddleware];

export function meta() {
  return [{ title: 'Bookify Dashboard' }];
}

/**
 * Root loader resolves the logged-in identity + scopes for the shell. It returns
 * `null` for anonymous visitors (login page) instead of redirecting, so auth
 * routes render outside the shell.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const info = await loadSessionInfo(request);
  return { info };
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
          {children}
          <Toaster />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const info = loaderData?.info ?? null;
  const location = useLocation();

  // Unauthenticated (login/logout) — render the page without the dashboard shell.
  if (!info) {
    return <Outlet />;
  }

  const membership = activeTenantMembership(info, location.pathname);

  return (
    <SidebarProvider style={tenantBrandStyle(membership?.tenantBranding ?? null)}>
      <AppSidebar info={info} />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
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
