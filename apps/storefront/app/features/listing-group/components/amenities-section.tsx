import type { ListingGroupAmenity } from '@booking/contracts';
import { Check } from 'lucide-react';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { LucideByName } from '~/components/lucide-by-name';

export function AmenitiesSection({ amenities }: { amenities: ListingGroupAmenity[] }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <SectionCard
      aria-labelledby="amenities-title"
      className="max-md:rounded-none max-md:border-x-0"
    >
      <h2 id="amenities-title" className="text-sm font-semibold md:text-base">
        {t('group.amenities')}
      </h2>
      {amenities.length ? (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-4 lg:grid-cols-4">
          {amenities.map((amenity) => (
            <div
              key={amenity.label}
              className="flex min-w-0 items-center gap-2 text-xs md:gap-2.5 md:text-sm"
            >
              <LucideByName
                name={amenity.icon}
                fallback={Check}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="md:truncate">{amenity.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('group.noAmenities')}</p>
      )}
    </SectionCard>
  );
}
