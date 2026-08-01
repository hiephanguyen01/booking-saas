import type { PublicListingDetailWithTimezoneResponse } from '@booking/contracts';
import { DetailPriceCard } from '~/components/detail-price-card';
import { SaleCampaignBanner } from '~/components/sale-campaign-banner';
import { minimumConfiguredPrice } from '~/lib/booking-presentation';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatVnd } from '~/lib/ui';
import { ListingBookingDialog } from '~/features/listing-group/components/room-booking-dialog';
import type { ScheduledBookingMode } from '~/features/booking-widget/lib/booking-modes';

export function ScheduledBookingCard({
  listing,
  preferredMode,
  today,
}: {
  listing: PublicListingDetailWithTimezoneResponse;
  preferredMode: ScheduledBookingMode;
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
    <DetailPriceCard>
      <SaleCampaignBanner campaign={listing.campaign} compact />
      <p className="mt-4 text-sm text-muted-foreground first:mt-0">
        {t('fromPriceShort')}{' '}
        <strong className="text-xl text-primary">
          {price ? formatVnd(price) : t('group.priceOnRequest')}
        </strong>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{unit}</p>
      <div className="mt-5">
        <ListingBookingDialog listing={listing} preferredMode={preferredMode} today={today} />
      </div>
    </DetailPriceCard>
  );
}
