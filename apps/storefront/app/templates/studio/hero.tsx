import type { PublicListingTypeResponse } from '@booking/contracts';
import { SearchForm } from '../../features/search/search-form';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontTenant } from '../../lib/tenant.server';

/**
 * Studio-vertical hero. Copy + image come from `theme_config.hero` (§16.2) with
 * i18n fallbacks; the floating search card's listing-type tabs are
 * auto-generated from the tenant's active listing types (§16.1 dynamic nav).
 */
export function StudioHero({
  tenant,
  listingTypes,
  locations,
  onTypeChange,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locations: string[];
  onTypeChange?: (typeSlug: string) => void;
}) {
  const { t } = useTranslation(NsI18n.Common);

  const image = tenant.hero.imageUrl ?? '/images/booking-studio/home/hero.png';
  const title = tenant.hero.title ?? t('home.heroTitleFallback', { name: tenant.name });
  const subtitle = tenant.hero.subtitle ?? t('home.heroSubtitleFallback');

  return (
    <section className="pb-18">
      {/* The dark backdrop and the white copy sit on the hero photo — the one
          place literal colours are allowed. */}
      <div className="relative h-68 overflow-hidden bg-black sm:h-70">
        <img
          src={image}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-x-4 top-8 flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-base font-semibold text-white sm:text-lg">{title}</h1>
          <p className="max-w-2xl text-sm text-white/90">{subtitle}</p>
        </div>
      </div>
      <div className="relative mx-auto -mt-42 max-w-292.5 px-4 sm:px-6 xl:px-0">
        <SearchForm
          listingTypes={listingTypes}
          locations={locations}
          variant="hero"
          onTypeChange={onTypeChange}
        />
      </div>
    </section>
  );
}
