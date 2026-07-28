import { AirVent, Camera, Check, Dog, LampCeiling, ParkingCircle, Wifi } from 'lucide-react';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';

const MAX_AMENITIES = 12;

export function AmenitiesSection({ amenities }: { amenities: string[] }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <SectionCard aria-labelledby="amenities-title">
      <h2 id="amenities-title" className="text-base font-semibold">
        {t('group.amenities')}
      </h2>
      {amenities.length ? (
        <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {amenities.slice(0, MAX_AMENITIES).map((amenity) => {
            const Icon = amenityIcon(amenity);
            return (
              <div key={amenity} className="flex min-w-0 items-center gap-2.5 text-sm">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{amenity}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('group.noAmenities')}</p>
      )}
    </SectionCard>
  );
}

/** Amenity names are free text typed by the partner, so match on the Vietnamese they enter. */
function amenityIcon(amenity: string) {
  const normalized = amenity.toLocaleLowerCase('vi');
  if (/wifi|wi-fi|internet/.test(normalized)) return Wifi;
  if (/xe|đỗ|đậu/.test(normalized)) return ParkingCircle;
  if (/camera|an ninh/.test(normalized)) return Camera;
  if (/điều hòa|máy lạnh|air/.test(normalized)) return AirVent;
  if (/thú cưng|pet/.test(normalized)) return Dog;
  if (/đèn|ánh sáng/.test(normalized)) return LampCeiling;
  return Check;
}
