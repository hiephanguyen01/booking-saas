import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { useOutletContext } from 'react-router';
import type { Route } from './+types/listing';
import { buildListingMeta } from '../features/listing/listing-meta';
import { buildListingStructuredData } from '../features/listing/listing-structured-data';
import { ListingPage } from '../features/listing/listing-page';
import {
  handleListingAction,
  loadListingRoute,
} from '../features/listing/server/listing-route.server';
import { PackageListingPage } from '../features/packages/package-listing-page';
import { jsonLd } from '../lib/seo';
import type { StorefrontContext } from '../root';

export async function action({ request, params }: Route.ActionArgs) {
  return handleListingAction(request, params.listingSlug);
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
  return buildListingMeta(loaderData?.listing);
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadListingRoute(request, url, params.listingSlug);
}

export default function ListingRoute(props: Route.ComponentProps) {
  const { tenant, locale, canonical, cspNonce } = useOutletContext<StorefrontContext>();
  const listing = props.loaderData.listing;
  const Page = listing.bookingSelection === 'fixed_packages' ? PackageListingPage : ListingPage;
  const structuredData = buildListingStructuredData({ tenant, locale, canonical, listing });

  return (
    <>
      <script
        nonce={cspNonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <Page {...props} />
    </>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel="Về trang chủ" />;
}
