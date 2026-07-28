import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { ProviderRoutePage } from '~/features/provider/components/provider-route-page';
import { buildProviderMeta } from '~/features/provider/lib/provider-meta';
import { loadProviderRoute } from '~/features/provider/server/provider-route.server';
import type { Route } from './+types/provider';

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return buildProviderMeta(loaderData?.profile, params.locale === 'en' ? 'en' : 'vi');
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadProviderRoute(request, params.partnerSlug, url);
}

export default function ProviderRoute(props: Route.ComponentProps) {
  return <ProviderRoutePage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <StorefrontRouteErrorBoundary error={error} locale={params.locale} />;
}
