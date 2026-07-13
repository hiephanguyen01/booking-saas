import { Link } from 'react-router';
import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/shared';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { useT } from '../../lib/i18n';
import { ListingCard } from '../../components/listing-card';
import { StudioHero } from './hero';

/**
 * Studio-vertical home (§16.1): a hero + one featured section per active listing
 * type (each with a "view all" link). The whole page is generated from the
 * tenant's data, so adding a listing type surfaces a new section with no code
 * change.
 */
export function StudioHome({
  tenant,
  listingTypes,
  listings,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
}) {
  const { t } = useT();
  return (
    <>
      <StudioHero tenant={tenant} listingTypes={listingTypes} />
      <div className="mx-auto max-w-7xl space-y-14 px-6 py-14">
        {listingTypes.map((type) => {
          const items = listings.filter((l) => l.listingTypeSlug === type.slug);
          if (items.length === 0) return null;
          return (
            <section key={type.id}>
              <div className="mb-5 flex items-end justify-between">
                <h2 className="text-2xl font-bold tracking-tight">{type.name}</h2>
                <Link
                  to={`/t/${type.slug}`}
                  className="text-sm font-semibold text-gray-900 underline-offset-4 hover:underline"
                >
                  {t('home.viewAll')}
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
                {items.slice(0, 4).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
