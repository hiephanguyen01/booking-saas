import type { PublicListingResponse } from '@booking/contracts';
import { SectionCard } from '../../components/section-card';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { FavoriteListingCard } from '../favorites/components/favorite-cards';

export function RelatedPhotographers({ listings }: { listings: PublicListingResponse[] }) {
  const { t } = useTranslation(NsI18n.Listing);
  if (!listings.length) return null;

  return (
    <SectionCard aria-labelledby="related-photographers-title">
      <h2 id="related-photographers-title" className="text-lg font-semibold">
        {t('photographer.related')}
      </h2>
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0">
        {listings.slice(0, 4).map((listing) => (
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
