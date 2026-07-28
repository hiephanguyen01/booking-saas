import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '~/features/catalog/components/catalog-page';
import { buildCatalogMeta } from '~/features/catalog/lib/catalog-meta';
import { loadCatalogRoute } from '~/features/catalog/server/catalog-route.server';
import { NsI18n, useTranslation } from '~/lib/i18n';

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
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const { t } = useTranslation(NsI18n.Error);
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel={t('home')} />;
}
