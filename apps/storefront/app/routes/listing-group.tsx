import { useOutletContext } from 'react-router';
import type { Route } from './+types/listing-group';
import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { localeParam } from '~/constants/paths';
import { contentReportShouldRevalidate } from '~/features/content-reports/lib/content-report-result';
import { ListingGroupPage } from '~/features/listing-group/components/listing-group-page';
import { buildListingGroupMeta } from '~/features/listing-group/lib/listing-group-meta';
import { buildListingGroupStructuredData } from '~/features/listing-group/lib/listing-group-structured-data';
import {
  handleListingGroupAction,
  loadListingGroupRoute,
} from '~/features/listing-group/server/listing-group-route.server';
import { jsonLd } from '~/lib/seo';
import type { StorefrontContext } from '~/root';
import { DETAIL_MOBILE_CHROME_HANDLE } from '~/features/site-shell/lib/site-header-handle';

export const handle = DETAIL_MOBILE_CHROME_HANDLE;

export function action({ request, params }: Route.ActionArgs) {
  return handleListingGroupAction(request, params.groupSlug);
}

export const shouldRevalidate = contentReportShouldRevalidate;

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return buildListingGroupMeta(loaderData?.group, localeParam(params.locale));
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadListingGroupRoute(request, url, params.groupSlug);
}

export default function ListingGroupRoute({ loaderData, params }: Route.ComponentProps) {
  const { group } = loaderData;
  const { tenant, canonical, cspNonce } = useOutletContext<StorefrontContext>();
  const locale = localeParam(params.locale);
  const structuredData = buildListingGroupStructuredData({ tenant, canonical, locale, group });

  return (
    <>
      {/* `suppressHydrationWarning` is for the nonce, not the JSON-LD: the browser blanks
          the `nonce` content attribute once CSP is applied (spec behaviour, so a CSS
          attribute selector cannot read it), which React hydration then reports as an
          unpatchable mismatch on every load. */}
      <script
        nonce={cspNonce}
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <ListingGroupPage loaderData={loaderData} />
    </>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <StorefrontRouteErrorBoundary error={error} locale={params.locale} />;
}
