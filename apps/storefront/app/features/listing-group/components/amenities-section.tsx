import type { ListingGroupAmenity } from '@booking/contracts';
import { Check } from 'lucide-react';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { LucideByName } from '~/components/lucide-by-name';

export function AmenitiesSection({ amenities }: { amenities: ListingGroupAmenity[] }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <SectionCard aria-labelledby="amenities-title">
      <h2 id="amenities-title" className="text-base font-semibold">
        {t('group.amenities')}
      </h2>
      {amenities.length ? (
        <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {amenities.map((amenity) => (
            <div key={amenity.label} className="flex min-w-0 items-center gap-2.5 text-sm">
              <LucideByName
                name={amenity.icon}
                fallback={Check}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="truncate">{amenity.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('group.noAmenities')}</p>
      )}
    </SectionCard>
  );
}
