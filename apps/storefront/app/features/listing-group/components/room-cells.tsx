import type { HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { Check, ChevronDown, Clock3, MapPin, Users } from 'lucide-react';
import { PendingLink } from '../../../components/pending-link';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { formatListingLocation, formatVnd } from '../../../lib/ui';
import { hoursBetween } from '../../../lib/time';
import { useLocale } from '../../../lib/use-locale';
import type { BookingMode, RoomOption } from '../listing-group-types';
import { checkoutHref, type RoomAvailabilityState } from '../listing-group-utils';
import { attributeIcon, roomAttributes, roomCapacity } from '../room-attributes';
import { SlotPicker } from './slot-picker';
import { RoomBookingDialog } from './room-booking-dialog';
import { RoomPhotoStrip } from './room-photo-strip';

export function RoomDetails({
  option,
  hidePhotos = false,
  onOpenPhoto,
}: {
  option: RoomOption;
  hidePhotos?: boolean;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const attributes = roomAttributes(option.child.attributes);
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
      <div className="flex flex-col gap-2.5">
        {attributes.length ? (
          attributes.map((attribute, index) => {
            const Icon = attributeIcon(index);
            return (
              <span key={attribute.key} className="flex items-start gap-2.5 text-muted-foreground">
                <Icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                {attribute.kind === 'area'
                  ? t('group.area', { value: attribute.value })
                  : attribute.label}
              </span>
            );
          })
        ) : (
          <span className="text-muted-foreground">{t('group.roomInfoPending')}</span>
        )}
      </div>
      {description ? (
        <Collapsible>
          <CollapsibleTrigger className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t('group.viewRoomDescription')} <ChevronDown className="size-4" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 leading-6 text-muted-foreground">
            {description}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

export function CapacityDetails({ option }: { option: RoomOption }) {
  const { t } = useTranslation(NsI18n.Listing);
  const capacity = roomCapacity(option.child.attributes);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium">{t('group.capacity')}</p>
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <Users className="size-4" aria-hidden="true" />
          {capacity ? t('group.maxGuests', { count: capacity }) : t('group.notProvided')}
        </p>
      </div>
      <div>
        <p className="font-medium">{t('group.surcharge')}</p>
        <p className="mt-2 text-muted-foreground">{t('group.surchargePolicy')}</p>
      </div>
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
      <strong className="text-xl text-primary">{formatVnd(option.price)}</strong>
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
    return <RoomBookingDialog option={option} groupSlug={groupSlug} preferredMode={mode} />;
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
