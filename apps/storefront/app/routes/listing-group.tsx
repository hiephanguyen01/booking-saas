import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { useOutletContext } from 'react-router';
import type { Route } from './+types/listing-group';
import { ListingGroupPage } from '~/features/listing-group/components/listing-group-page';
import { buildListingGroupMeta } from '~/features/listing-group/lib/listing-group-meta';
import { buildListingGroupStructuredData } from '~/features/listing-group/lib/listing-group-structured-data';
import {
  handleListingGroupAction,
  loadListingGroupRoute,
} from '~/features/listing-group/server/listing-group-route.server';
import { jsonLd } from '~/lib/seo';
import type { StorefrontContext } from '~/root';

export function action({ request, params }: Route.ActionArgs) {
  return handleListingGroupAction(request, params.groupSlug);
}

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: {
  actionResult: unknown;
  defaultShouldRevalidate: boolean;
}) {
  return actionResult && typeof actionResult === 'object' && 'reportOk' in actionResult
    ? false
    : defaultShouldRevalidate;
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return buildListingGroupMeta(loaderData?.group);
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadListingGroupRoute(request, url, params.groupSlug);
}

export default function ListingGroupRoute({ loaderData, params }: Route.ComponentProps) {
  const { group } = loaderData;
  const { tenant, canonical, cspNonce } = useOutletContext<StorefrontContext>();
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const structuredData = buildListingGroupStructuredData({ tenant, canonical, locale, group });

  return (
    <>
      <script
        nonce={cspNonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <ListingGroupPage loaderData={loaderData} />
    </>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel="Về trang chủ" />;
}
