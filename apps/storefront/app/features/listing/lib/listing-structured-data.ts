import type { PublicListingDetailResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import type { StorefrontContext } from '~/features/root/lib/storefront-context';
import {
  breadcrumbNode,
  organizationNode,
  serviceNode,
  structuredDataGraph,
} from '~/lib/structured-data';

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

  return structuredDataGraph([
    organizationNode(origin, tenant.name, tenant.themeConfig.logoUrl),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: listing.title,
      description: listing.description,
      inLanguage: locale,
      image: listing.photos,
    },
    serviceNode({
      canonical,
      origin,
      name: listing.title,
      images: listing.photos,
      reviewCount: listing.reviewCount,
      ratingAvg: listing.ratingAvg,
    }),
    breadcrumbNode(locale, canonical, listing.title),
  ]);
}
