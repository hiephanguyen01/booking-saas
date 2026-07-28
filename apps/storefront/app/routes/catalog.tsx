import type { Route } from './+types/catalog';
import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { CatalogPage } from '~/features/catalog/components/catalog-page';
import { buildCatalogMeta } from '~/features/catalog/lib/catalog-meta';
import { loadCatalogRoute } from '~/features/catalog/server/catalog-route.server';

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return buildCatalogMeta(loaderData, params.typeSlug);
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadCatalogRoute(request, url, params.typeSlug);
}

export default function CatalogRoute(props: Route.ComponentProps) {
  return <CatalogPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <StorefrontRouteErrorBoundary error={error} locale={params.locale} />;
}
