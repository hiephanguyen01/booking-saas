import { Link } from 'react-router';
import type { PublicListingTypeResponse } from '@booking/shared';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { useT } from '../../lib/i18n';
import { typeIcon } from '../../lib/ui';

/**
 * Studio-vertical hero. Copy + image come from `theme_config.hero` (§16.2) with
 * i18n fallbacks; the type pills are auto-generated from the tenant's active
 * listing types (§16.1 dynamic navigation).
 */
export function StudioHero({
  tenant,
  listingTypes,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
}) {
  const { t } = useT();
  const title = tenant.hero.title ?? t('home.heroTitleFallback', { name: tenant.name });
  const subtitle = tenant.hero.subtitle ?? t('home.heroSubtitleFallback');
  const image = tenant.hero.imageUrl ?? `https://picsum.photos/seed/${tenant.slug}-hero/1600/700`;

  return (
    <section className="mx-auto max-w-7xl px-6 pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-gray-900">
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
        <div className="relative flex min-h-80 flex-col justify-end gap-4 p-8 md:min-h-100 md:p-12">
          <h1 className="max-w-2xl text-3xl leading-tight font-extrabold text-white md:text-5xl">
            {title}
          </h1>
          <p className="max-w-xl text-white/85">{subtitle}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {listingTypes.slice(0, 5).map((type) => {
              const Icon = typeIcon(type.slug);
              return (
                <Link
                  key={type.id}
                  to={`/t/${type.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                >
                  <Icon className="size-4" />
                  {type.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
