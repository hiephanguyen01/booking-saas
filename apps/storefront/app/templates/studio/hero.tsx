import type { PublicListingTypeResponse } from '@booking/contracts';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { useT } from '../../lib/i18n';
import { HeroSearchCard } from './hero-search-card';

/**
 * Studio-vertical hero. Copy + image come from `theme_config.hero` (§16.2) with
 * i18n fallbacks; the floating search card's listing-type tabs are
 * auto-generated from the tenant's active listing types (§16.1 dynamic nav).
 */
export function StudioHero({
  tenant,
  listingTypes,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
}) {
  const { t } = useT();
  const title = tenant.hero.title ?? t('common.home.heroTitleFallback', { name: tenant.name });
  const subtitle = tenant.hero.subtitle ?? t('common.home.heroSubtitleFallback');
  const image = tenant.hero.imageUrl ?? `https://picsum.photos/seed/${tenant.slug}-hero/1600/700`;

  return (
    <section className="mx-auto max-w-7xl px-6 pt-6 pb-24 sm:pb-32">
      <div className="relative overflow-hidden rounded-3xl bg-gray-900">
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
        <div className="relative flex min-h-64 flex-col justify-start gap-3 p-8 sm:min-h-72 md:p-12">
          <h1 className="max-w-2xl text-2xl leading-tight font-extrabold text-white sm:text-4xl">{title}</h1>
          <p className="max-w-xl text-sm text-white/85 sm:text-base">{subtitle}</p>
        </div>
      </div>
      <div className="relative z-10 mx-4 -mt-16 sm:mx-8 sm:-mt-20">
        <HeroSearchCard listingTypes={listingTypes} />
      </div>
    </section>
  );
}
