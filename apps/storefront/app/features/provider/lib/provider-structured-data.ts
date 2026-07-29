import type { Locale } from '@booking/i18n';
import {
  aggregateRatingNode,
  breadcrumbNode,
  organizationNode,
  structuredDataGraph,
} from '~/lib/structured-data';

interface ProviderStructuredDataInput {
  tenant: { name: string };
  locale: Locale;
  canonical: string;
  profile: {
    name: string;
    description?: string | null;
    logoUrl?: string | null;
    partnerType: string;
    stats: { reviewCount: number; ratingAvg: number | null };
  };
}

/**
 * The provider page's JSON-LD, built from the same nodes as the listing and
 * listing-group graphs. It used to be an object literal inside the page's `.tsx`
 * — the third graph in the app, and the only one without `@graph`, a breadcrumb
 * or `bestRating`/`worstRating`.
 */
export function buildProviderStructuredData({
  tenant,
  locale,
  canonical,
  profile,
}: ProviderStructuredDataInput) {
  const origin = new URL(canonical).origin;

  return structuredDataGraph([
    organizationNode(origin, tenant.name),
    {
      // A partner is a company or an individual; both are `provider` of the tenant's services.
      '@type': profile.partnerType === 'company' ? 'Organization' : 'Person',
      '@id': `${canonical}#provider`,
      name: profile.name,
      url: canonical,
      description: profile.description,
      ...(profile.logoUrl ? { image: profile.logoUrl } : {}),
      ...aggregateRatingNode(profile.stats.reviewCount, profile.stats.ratingAvg),
    },
    breadcrumbNode(locale, canonical, profile.name),
  ]);
}
