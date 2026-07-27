import type { PublicListingDetailResponse } from '@booking/contracts';
import { minimumConfiguredPrice } from '../../../lib/booking-presentation';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { formatVnd } from '../../../lib/ui';
import {
  ListingBookingDialog,
  type ListingBookingMode,
} from '../../listing-group/components/room-booking-dialog';

export function StudioBookingCard({
  listing,
  preferredMode,
  today,
}: {
  listing: PublicListingDetailResponse;
  preferredMode: ListingBookingMode;
  today: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const price = minimumConfiguredPrice(listing.modeConfig);
  const supportsHourly = listing.bookingModes.includes('hourly');
  const supportsDaily = listing.bookingModes.includes('daily');
  const unit =
    supportsHourly && supportsDaily
      ? t('group.hourOrDay')
      : supportsDaily
        ? t('perDay')
        : t('perHour');

  return (
    <div className="rounded-lg bg-card p-5 text-right text-card-foreground shadow-sm">
      <p className="text-sm text-muted-foreground">
        {t('fromPriceShort')}{' '}
        <strong className="text-xl text-primary">
          {price ? formatVnd(price) : t('group.priceOnRequest')}
        </strong>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{unit}</p>
      <div className="mt-5">
        <ListingBookingDialog listing={listing} preferredMode={preferredMode} today={today} />
      </div>
    </div>
  );
}
