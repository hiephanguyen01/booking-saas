import type { PublicListingResponse } from '@booking/contracts';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';

const MAX_RELATED = 4;

export function RelatedListings({ listings }: { listings: PublicListingResponse[] }) {
  const { t } = useTranslation(NsI18n.Listing);
  if (!listings.length) return null;
  return (
    <SectionCard aria-labelledby="related-title">
      <h2 id="related-title" className="text-base font-semibold">
        {t('group.related')}
      </h2>
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0">
        {listings.slice(0, MAX_RELATED).map((listing) => (
          <div
            key={listing.id}
            className="w-[78vw] max-w-69.5 shrink-0 snap-start sm:w-69.5 xl:w-auto xl:max-w-none"
          >
            <FavoriteListingCard listing={listing} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
