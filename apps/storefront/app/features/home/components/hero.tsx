import type { PublicListingTypeResponse } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { SearchForm, type LocationOption } from '~/features/search/components/search-form';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontTenant } from '~/lib/server/tenant.server';

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
  locations: LocationOption[];
  onTypeChange?: (typeSlug: string) => void;
}) {
  const { t } = useTranslation(NsI18n.Common);

  const image = tenant.themeConfig.hero?.imageUrl || null;
  const title =
    tenant.themeConfig.hero?.title || t('home.heroTitleFallback', { name: tenant.name });
  const subtitle = tenant.themeConfig.hero?.subtitle || t('home.heroSubtitleFallback');

  return (
    <section className="pb-6 sm:pb-18">
      <div className="relative h-56 overflow-hidden bg-primary sm:h-70">
        {image ? (
          <>
            <Image
              src={image}
              alt=""
              priority
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-scrim-soft" />
          </>
        ) : null}
        <div className="absolute inset-x-4 top-8 flex flex-col items-center gap-1.5 text-center">
          <h1
            className={
              image
                ? 'text-base font-semibold text-white sm:text-lg'
                : 'text-base font-semibold text-primary-foreground sm:text-lg'
            }
          >
            {title}
          </h1>
          <p
            className={
              image
                ? 'max-w-2xl text-sm text-white/90'
                : 'max-w-2xl text-sm text-primary-foreground/90'
            }
          >
            {subtitle}
          </p>
        </div>
      </div>
      <div className="relative mx-auto -mt-38 max-w-292.5 px-4 sm:-mt-42 sm:px-6 xl:px-0">
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
