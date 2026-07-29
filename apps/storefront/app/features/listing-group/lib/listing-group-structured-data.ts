import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import {
  breadcrumbNode,
  organizationNode,
  serviceNode,
  structuredDataGraph,
} from '~/lib/structured-data';

type ListingGroupStructuredDataInput = {
  tenant: { name: string };
  canonical: string;
  locale: Locale;
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

  return structuredDataGraph([
    organizationNode(origin, tenant.name),
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
    serviceNode({
      canonical,
      origin,
      name: group.title,
      images: group.photos,
      reviewCount: group.reviewCount,
      ratingAvg: group.ratingAvg,
    }),
    breadcrumbNode(locale, canonical, group.title),
  ]);
}
