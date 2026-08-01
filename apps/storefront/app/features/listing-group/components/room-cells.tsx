import type { AttributeField, HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Check, Clock3, MapPin } from 'lucide-react';
import { PendingLink } from '~/components/pending-link';
import { SalePrice } from '~/components/sale-price';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatListingLocation, formatVnd } from '~/lib/ui';
import { hoursBetween } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';
import type { BookingMode, RoomOption } from '~/features/listing-group/lib/listing-group-types';
import {
  checkoutHref,
  type RoomAvailabilityState,
} from '~/features/booking-widget/lib/slot-selection';
import { specCards } from '~/lib/listing-attributes';
import { SlotPicker } from '~/features/booking-widget/components/slot-picker';
import { RoomBookingDialog } from './room-booking-dialog';
import { RoomPhotoStrip } from '~/components/room-photo-strip';
import { OfferingDetailsDisclosure } from '~/components/offering-details-disclosure';

export function RoomDetails({
  option,
  attributeSchema,
  hidePhotos = false,
  onOpenPhoto,
}: {
  option: RoomOption;
  attributeSchema: AttributeField[];
  hidePhotos?: boolean;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const cards = specCards(option.child.attributes, attributeSchema);
  const description = option.detail.description || option.child.description;
  const location = formatListingLocation(option.detail);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold leading-6">{option.child.title}</h3>
      {location ? (
        <span className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {location}
        </span>
      ) : null}
      {!hidePhotos ? (
        <RoomPhotoStrip
          photos={option.child.photos}
          title={option.child.title}
          onOpenPhoto={onOpenPhoto}
        />
      ) : null}
      <OfferingDetailsDisclosure
        cards={cards}
        description={description}
        emptyLabel={t('group.roomInfoPending')}
      />
    </div>
  );
}

export function RoomPrice({
  option,
  mode,
  state,
}: {
  option: RoomOption;
  mode: BookingMode;
  state: RoomAvailabilityState;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  if (state === 'browse')
    return option.price ? (
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t('group.fromRoomPrice')}</span>
        <strong className="text-xl text-primary">{formatVnd(option.price)}</strong>
        <span className="text-muted-foreground">{t('group.hourOrDay')}</span>
      </div>
    ) : (
      <p className="font-medium text-muted-foreground">{t('group.noPrice')}</p>
    );
  if (state === 'booked')
    return <p className="font-medium text-muted-foreground">{t('group.soldOut')}</p>;
  if (state === 'missing-price')
    return <p className="font-medium text-muted-foreground">{t('group.noPrice')}</p>;
  const selectedHours = option.start && option.end ? hoursBetween(option.start, option.end) : null;
  return (
    <div className="flex flex-col gap-1">
      <strong className="text-xl text-primary">
        {option.quote ? (
          <SalePrice price={option.quote.subtotal} regularPrice={option.quote.regularSubtotal} />
        ) : (
          formatVnd(option.price)
        )}
      </strong>
      <span className="text-muted-foreground">
        {mode === 'hourly'
          ? selectedHours
            ? t('group.priceForHours', { count: selectedHours })
            : t('group.pricePerHour')
          : t('group.priceTotalRange')}
      </span>
    </div>
  );
}

export function RoomAction({
  option,
  groupSlug,
  mode,
  date,
  state,
  slots,
}: {
  option: RoomOption;
  groupSlug: string;
  mode: BookingMode;
  date: string;
  state: RoomAvailabilityState;
  slots: HourlySlot[];
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();

  if (state === 'browse') {
    return (
      <RoomBookingDialog
        option={option}
        groupSlug={groupSlug}
        preferredMode={mode}
        today={option.bookingToday}
      />
    );
  }

  if (state === 'booked')
    return (
      <div className="flex items-center gap-2 font-medium text-muted-foreground">
        <Clock3 className="size-5" aria-hidden="true" />
        {t('group.roomBooked')}
      </div>
    );
  if (state === 'missing-price')
    return (
      <Button className="w-full" disabled>
        {t('group.cannotBook')}
      </Button>
    );
  if (mode === 'hourly') return <SlotPicker option={option} slots={slots} date={date} />;
  if (!option.start || !option.end)
    return (
      <Button className="w-full" disabled>
        {t('group.cannotBook')}
      </Button>
    );
  return (
    <PendingLink
      to={checkoutHref({
        locale,
        listingSlug: option.child.slug,
        mode: 'daily',
        start: option.start,
        end: option.end,
      })}
      className="w-full"
      pendingLabel={t('group.navigating')}
    >
      {t('group.select')}
    </PendingLink>
  );
}

export function PolicyList({ depositPercent }: { depositPercent: number }) {
  const { t } = useTranslation(NsI18n.Listing);
  const policies = [
    depositPercent > 0
      ? t('group.policyDepositPercent', { percent: depositPercent })
      : t('group.policyDeposit'),
    t('group.policyCancellation'),
    t('group.policyPrivacy'),
  ];
  return (
    <div className="mt-5 flex flex-col gap-2.5">
      <p className="font-medium">{t('group.policiesTitle')}</p>
      {policies.map((policy) => (
        <span
          key={policy}
          className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"
        >
          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {policy}
        </span>
      ))}
    </div>
  );
}
