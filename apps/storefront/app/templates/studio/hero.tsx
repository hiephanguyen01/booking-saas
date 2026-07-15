import type { PublicListingTypeResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { HeroSearchCard } from './hero-search-card';

/**
 * Studio-vertical hero. Copy + image come from `theme_config.hero` (§16.2) with
 * i18n fallbacks; the floating search card's listing-type tabs are
 * auto-generated from the tenant's active listing types (§16.1 dynamic nav).
 */
export function StudioHero({
  tenant,
  listingTypes,
  locations,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locations: string[];
}) {
  const { t } = useTranslation(NsI18n.Common);

  const image = tenant.hero.imageUrl ?? '/images/booking-studio/home/hero.png';

  return (
    <section className="pb-18">
      <div className="relative h-68 overflow-hidden bg-gray-950 sm:h-70">
        <img
          src={image}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
        <h1 className="absolute inset-x-4 top-10 text-center text-base font-semibold text-white sm:text-lg">
          {t('home.heroTagline')}
        </h1>
      </div>
      <div className="relative mx-auto -mt-42 max-w-292.5 px-4 sm:px-6 xl:px-0">
        <HeroSearchCard listingTypes={listingTypes} locations={locations} />
      </div>
    </section>
  );
}
