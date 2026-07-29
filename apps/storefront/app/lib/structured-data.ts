import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { localeTranslator } from '~/lib/translator';

/**
 * The JSON-LD nodes every detail page emits identically.
 *
 * Only the page node itself (`WebPage` vs `CollectionPage`) differs between the
 * listing and listing-group graphs; keeping the rest here means a schema.org
 * change lands in one place instead of two.
 */

export function organizationNode(origin: string, name: string, logoUrl?: string | null) {
  return {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name,
    url: origin,
    ...(logoUrl ? { logo: logoUrl } : {}),
  };
}

/** Google drops a rating with no reviews behind it, so emit it only when there is one. */
export function aggregateRatingNode(reviewCount: number, ratingAvg: number | null) {
  if (reviewCount <= 0 || ratingAvg === null) return {};
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: ratingAvg,
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
  };
}

export function serviceNode(input: {
  canonical: string;
  origin: string;
  name: string;
  images: readonly string[];
  reviewCount: number;
  ratingAvg: number | null;
}) {
  return {
    '@type': 'Service',
    '@id': `${input.canonical}#service`,
    name: input.name,
    image: input.images,
    provider: { '@id': `${input.origin}/#organization` },
    ...aggregateRatingNode(input.reviewCount, input.ratingAvg),
  };
}

export function breadcrumbNode(locale: Locale, canonical: string, title: string) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: localeTranslator(locale).t('common.breadcrumbHome'),
        item: new URL(storefrontPaths.home(locale), canonical).toString(),
      },
      { '@type': 'ListItem', position: 2, name: title, item: canonical },
    ],
  };
}

export function structuredDataGraph(nodes: unknown[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
