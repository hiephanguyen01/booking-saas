import { useOutletContext } from 'react-router';
import type { loadProviderRoute } from '~/features/provider/server/provider-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import type { StorefrontContext } from '~/root';
import { jsonLd } from '~/lib/seo';
import { ProviderProfilePage } from './provider-profile-page';

export function ProviderRoutePage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadProviderRoute>;
}) {
  const { canonical, cspNonce } = useOutletContext<StorefrontContext>();
  const { profile } = loaderData;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': profile.partnerType === 'company' ? 'Organization' : 'Person',
    name: profile.name,
    url: canonical,
    description: profile.description,
    image: profile.logoUrl,
    aggregateRating:
      profile.stats.reviewCount && profile.stats.ratingAvg
        ? {
            '@type': 'AggregateRating',
            ratingValue: profile.stats.ratingAvg,
            reviewCount: profile.stats.reviewCount,
          }
        : undefined,
  };

  return (
    <>
      <ProviderProfilePage loaderData={loaderData} />
      <script
        nonce={cspNonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
    </>
  );
}
