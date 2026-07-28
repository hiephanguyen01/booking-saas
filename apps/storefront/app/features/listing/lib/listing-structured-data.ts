import type { PublicListingDetailResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import type { StorefrontContext } from '~/features/root/lib/storefront-context';

interface ListingStructuredDataInput {
  tenant: StorefrontContext['tenant'];
  locale: Locale;
  canonical: string;
  listing: PublicListingDetailResponse;
}

export function buildListingStructuredData({
  tenant,
  locale,
  canonical,
  listing,
}: ListingStructuredDataInput) {
  const origin = new URL(canonical).origin;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: tenant.name,
        url: origin,
        ...(tenant.themeConfig.logoUrl ? { logo: tenant.themeConfig.logoUrl } : {}),
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: listing.title,
        description: listing.description,
        inLanguage: locale,
        image: listing.photos,
      },
      {
        '@type': 'Service',
        '@id': `${canonical}#service`,
        name: listing.title,
        image: listing.photos,
        provider: { '@id': `${origin}/#organization` },
        ...(listing.reviewCount > 0 && listing.ratingAvg !== null
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: listing.ratingAvg,
                reviewCount: listing.reviewCount,
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
          { '@type': 'ListItem', position: 2, name: listing.title, item: canonical },
        ],
      },
    ],
  };
}
