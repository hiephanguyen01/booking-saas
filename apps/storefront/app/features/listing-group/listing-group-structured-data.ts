import { storefrontPaths } from '~/lib/locale-paths';

type ListingGroupStructuredDataInput = {
  tenant: { name: string };
  canonical: string;
  locale: 'vi' | 'en';
  group: {
    title: string;
    description?: string | null;
    photos: readonly string[];
    reviewCount: number;
    ratingAvg: number | null;
    listings: ReadonlyArray<{ title: string; slug: string }>;
  };
};

export function buildListingGroupStructuredData({
  tenant,
  canonical,
  locale,
  group,
}: ListingGroupStructuredDataInput) {
  const origin = new URL(canonical).origin;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: tenant.name,
        url: origin,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: group.title,
        description: group.description,
        image: group.photos,
        hasPart: group.listings.map((listing) => ({
          '@type': 'Service',
          name: listing.title,
          url: new URL(storefrontPaths.listing(locale, listing.slug), canonical).toString(),
        })),
      },
      {
        '@type': 'Service',
        '@id': `${canonical}#service`,
        name: group.title,
        image: group.photos,
        provider: { '@id': `${origin}/#organization` },
        ...(group.reviewCount > 0 && group.ratingAvg !== null
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: group.ratingAvg,
                reviewCount: group.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: locale === 'vi' ? 'Trang chủ' : 'Home',
            item: new URL(`/${locale}`, canonical).toString(),
          },
          { '@type': 'ListItem', position: 2, name: group.title, item: canonical },
        ],
      },
    ],
  };
}
