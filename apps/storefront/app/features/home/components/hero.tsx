import type { PublicListingTypeResponse } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { SearchForm, type LocationOption } from '~/features/search/components/search-form';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { StorefrontTenant } from '~/lib/server/tenant.server';

/**
 * Studio-vertical hero. Copy + image come from `theme_config.hero` (§16.2) with
 * i18n fallbacks; the floating search card's listing-type tabs are
 * auto-generated from the tenant's active listing types (§16.1 dynamic nav).
 *
 * The photo is a backdrop, not a band. It starts at the top of the document
 * (behind the transparent header this page opts into) and fades into
 * `--background` under the search card, so the card lands on the picture rather
 * than on a hard seam below it — and a tenant that has configured no hero image
 * gets the same shape in its own primary colour instead of an empty strip.
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
    <section className="relative isolate pb-6 sm:pb-12">
      <div className="absolute inset-x-0 top-0 -z-10 h-104 overflow-hidden bg-primary sm:h-120">
        {image ? (
          <Image src={image} alt="" priority className="size-full object-cover" />
        ) : null}
        {/* Two stops of scrim over the picture, then the page background — the
            same ramp with or without an image, so the headline keeps its
            contrast either way. */}
        <div className="absolute inset-0 bg-linear-to-b from-scrim-strong via-scrim to-background" />
      </div>

      <div className="mx-auto w-full max-w-292.5 px-4 pt-18 sm:px-6 sm:pt-22 xl:px-0">
        <div className="flex flex-col items-center gap-2 px-2 pb-6 text-center sm:pb-8">
          <h1 className="text-xl leading-7 font-semibold text-balance text-white sm:text-2xl sm:leading-8">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-5 text-pretty text-white/85">{subtitle}</p>
        </div>

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
