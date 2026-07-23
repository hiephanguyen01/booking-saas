import { useRouteLoaderData } from 'react-router';
import type { Route } from './+types/root';
import './app.css';
import { RootErrorBoundaryView } from './features/root/components/root-error-boundary';
import { StorefrontAppShell } from './features/root/components/storefront-app-shell';
import { StorefrontDocument } from './features/root/components/storefront-document';
import { buildRootMeta } from './features/root/root-meta';
import { loadStorefrontRoot } from './features/root/server/root-loader.server';
import { storefrontRequestMiddleware } from './lib/request-security.server';
import { storefrontCspNonceContext } from './lib/security-context.server';

export type { StorefrontContext } from './features/root/storefront-context';

export const middleware: Route.MiddlewareFunction[] = [storefrontRequestMiddleware];

export function loader({ request, url, context }: Route.LoaderArgs) {
  return loadStorefrontRoot(request, url, context.get(storefrontCspNonceContext));
}

export function meta({ loaderData }: Route.MetaArgs) {
  return buildRootMeta(loaderData);
}

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useRouteLoaderData<typeof loader>('root');
  return (
    <StorefrontDocument
      locale={loaderData?.locale ?? 'vi'}
      faviconUrl={loaderData?.tenant?.themeConfig.faviconUrl || null}
    >
      {children}
    </StorefrontDocument>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return <StorefrontAppShell loaderData={loaderData} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // The root loader may be what threw, so fall back to the default locale.
  const rootData = useRouteLoaderData<typeof loader>('root');
  const locale = rootData?.locale ?? 'vi';
  return <RootErrorBoundaryView error={error} locale={locale} rootData={rootData} />;
}
