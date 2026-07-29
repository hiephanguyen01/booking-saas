import { useOutletContext } from 'react-router';
import type { Route } from './+types/listing';
import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { contentReportShouldRevalidate } from '~/features/content-reports/lib/content-report-result';
import { buildListingMeta } from '~/features/listing/lib/listing-meta';
import { buildListingStructuredData } from '~/features/listing/lib/listing-structured-data';
import { ListingPage } from '~/features/listing/components/listing-page';
import {
  handleListingAction,
  loadListingRoute,
} from '~/features/listing/server/listing-route.server';
import { PackageListingPage } from '~/features/packages/components/package-listing-page';
import { jsonLd } from '~/lib/seo';
import type { StorefrontContext } from '~/root';

export async function action({ request, params }: Route.ActionArgs) {
  return handleListingAction(request, params.listingSlug);
}

export const shouldRevalidate = contentReportShouldRevalidate;

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
  return <StorefrontRouteErrorBoundary error={error} locale={params.locale} />;
}
