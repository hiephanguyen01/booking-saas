import { useOutletContext } from 'react-router';
import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { localeParam } from '~/constants/paths';
import { ProviderProfilePage } from '~/features/provider/components/provider-profile-page';
import { buildProviderMeta } from '~/features/provider/lib/provider-meta';
import { buildProviderStructuredData } from '~/features/provider/lib/provider-structured-data';
import { loadProviderRoute } from '~/features/provider/server/provider-route.server';
import { jsonLd } from '~/lib/seo';
import type { StorefrontContext } from '~/root';
import type { Route } from './+types/provider';

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return buildProviderMeta(loaderData?.profile, localeParam(params.locale));
}

export function loader({ request, params, url }: Route.LoaderArgs) {
  return loadProviderRoute(request, params.partnerSlug, url);
}

export default function ProviderRoute(props: Route.ComponentProps) {
  const { tenant, locale, canonical, cspNonce } = useOutletContext<StorefrontContext>();
  const structuredData = buildProviderStructuredData({
    tenant,
    locale,
    canonical,
    profile: props.loaderData.profile,
  });

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
      <ProviderProfilePage {...props} />
    </>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <StorefrontRouteErrorBoundary error={error} locale={params.locale} />;
}
