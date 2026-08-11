import { NsI18n, useTranslation } from '@booking/i18n';
import { Link } from 'react-router';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { storefrontPaths } from '~/constants/paths';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import { useLocale } from '~/hooks/use-locale';
import { HomeDiscoverySectionHeading, HomeListingRail } from './home-listing-rail';

/** The home page's lead rail of listings. */
export function TopListingsSection({
  listings,
  listingTypeName,
  listingTypeSlug,
  pending,
}: {
  listings: DiscoveryListingCardData[];
  listingTypeName: string;
  listingTypeSlug: string;
  pending: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locale = useLocale();
  if (!pending && listings.length === 0) return null;

  const title = t('home.topListings', { type: listingTypeName });

  if (pending) {
    return (
      <section className="flex flex-col gap-4 sm:gap-6">
        <HomeDiscoverySectionHeading title={title} />
        <HomeListingCardsSkeleton label={t('loading')} count={4} layout="carousel" />
      </section>
    );
  }

  return (
    <HomeListingRail
      title={title}
      items={listings}
      previousLabel={t('home.railPrevious')}
      nextLabel={t('home.railNext')}
      action={
        <Link
          to={storefrontPaths.catalog(locale, listingTypeSlug)}
          prefetch="intent"
          className="flex items-center text-sm font-semibold text-primary hover:underline"
        >
          {t('home.loadMore')}
        </Link>
      }
    />
  );
}
