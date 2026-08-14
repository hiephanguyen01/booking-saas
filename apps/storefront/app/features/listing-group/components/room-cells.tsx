import type { AttributeField, HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Check, Clock3, Info, MapPin } from 'lucide-react';
import { PendingLink } from '~/components/pending-link';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatListingLocation, formatVnd } from '~/lib/ui';
import { hoursBetween } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';
import type { BookingMode, RoomOption } from '~/features/listing-group/lib/listing-group-types';
import {
  checkoutHref,
  type RoomAvailabilityState,
} from '~/features/booking-widget/lib/slot-selection';
import { specCards, type SpecCard } from '~/lib/listing-attributes';
import { SlotPicker } from '~/features/booking-widget/components/slot-picker';
import { RoomBookingDialog } from './room-booking-dialog';
import { RoomPhotoStrip } from '~/components/room-photo-strip';
import { OfferingDetailsDisclosure } from '~/components/offering-details-disclosure';
import { cn } from '@booking/ui/lib/utils';
import { LucideByName } from '~/components/lucide-by-name';

export function RoomHeading({ option }: { option: RoomOption }) {
  const location = formatListingLocation(option.detail);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm leading-5 font-semibold md:text-lg md:leading-6">
        {option.child.title}
      </h3>
      {location ? (
        <span className="flex items-start gap-2 text-xs text-muted-foreground md:text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {location}
        </span>
      ) : null}
    </div>
  );
}

export function RoomDetails({
  option,
  attributeSchema,
  hidePhotos = false,
  hideHeading = false,
  onOpenPhoto,
}: {
  option: RoomOption;
  attributeSchema: AttributeField[];
  hidePhotos?: boolean;
  hideHeading?: boolean;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const cards = specCards(option.child.attributes, attributeSchema);
  const description = option.detail.description || option.child.description;
  return (
    <div className="flex flex-col gap-4">
      {!hideHeading ? <RoomHeading option={option} /> : null}
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
        collapsedSummary={cards.length ? <RoomCompactSpecs cards={cards} /> : undefined}
      />
    </div>
  );
}

function RoomCompactSpecs({ cards }: { cards: SpecCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      {cards.slice(0, 4).map((card) => (
        <div key={card.key} className="flex min-w-0 items-start gap-2">
          <LucideByName
            name={card.icon}
            fallback={Info}
            className="mt-0.5 size-4 shrink-0 text-foreground"
          />
          {card.kind === 'area' ? (
            <p className="truncate text-xs text-muted-foreground">{card.value} m²</p>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{card.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {card.kind === 'list' ? card.lines[0] : card.line}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RoomPrice({
  option,
  mode,
  state,
  compact = false,
}: {
  option: RoomOption;
  mode: BookingMode;
  state: RoomAvailabilityState;
  compact?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  if (state === 'browse')
    return option.price ? (
      <div className={cn('flex flex-col gap-1', compact && 'items-end text-right text-xs')}>
        <span className="text-sm text-muted-foreground">{t('group.fromRoomPrice')}</span>
        <strong className={cn('text-xl text-primary', compact && 'text-base')}>
          {formatVnd(option.price)}
        </strong>
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
    <div className={cn('flex flex-col gap-1', compact && 'items-end text-right text-xs')}>
      <strong className={cn('text-xl text-primary', compact && 'text-base')}>
        {formatVnd(option.price)}
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

export function PolicyList({
  depositPercent,
  compact = false,
}: {
  depositPercent: number;
  compact?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const policies = [
    depositPercent > 0
      ? t('group.policyDepositPercent', { percent: depositPercent })
      : t('group.policyDeposit'),
    t('group.policyCancellation'),
    t('group.policyPrivacy'),
  ];
  return (
    <div className={cn('mt-5 flex flex-col gap-2.5', compact && 'mt-0 gap-1')}>
      <p className={cn('font-medium', compact && 'text-xs')}>{t('group.policiesTitle')}</p>
      {policies.map((policy) => (
        <span
          key={policy}
          className={cn(
            'flex items-start gap-2 text-xs leading-5 text-muted-foreground',
            compact && 'gap-1.5 leading-4',
          )}
        >
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
          {policy}
        </span>
      ))}
    </div>
  );
}
