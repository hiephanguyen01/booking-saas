import { Image } from '@booking/ui/components/media/image';
import { CalendarDays, Clock3, PackageCheck, Users } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';
import { ListingThumbnail } from '~/components/listing-thumbnail';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';

/**
 * What was booked: photo, listing, resource, package, date, time, duration,
 * mode, party size, attributes and description.
 *
 * Shared between the signed-in detail page and the guest lookup, which show the
 * same booking to the same person through different doors — the guest reached it
 * with a code and an emailed OTP rather than a session. Only the *actions*
 * around it differ, so those stay with their callers and this stays presentation.
 */
export function BookingListingSummary({
  booking,
  className,
}: {
  booking: BookingDetailViewModel;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const isInventory = booking.bookingMode === 'inventory';
  const mode =
    booking.bookingMode === 'hourly' ||
    booking.bookingMode === 'daily' ||
    booking.bookingMode === 'inventory'
      ? booking.bookingMode
      : 'other';
  const participantCount = String(isInventory ? booking.quantity : booking.guestCount);

  return (
    <div className={className}>
      <div className="grid gap-4 sm:grid-cols-[166px_minmax(0,1fr)]">
        {booking.imageUrl ? (
          <Image
            src={booking.imageUrl}
            alt={booking.listingTitle}
            className="aspect-4/3 w-full rounded-(--sf-image-radius) object-cover object-top"
          />
        ) : (
          <ListingThumbnail
            label={booking.listingTitle}
            className="aspect-4/3 w-full rounded-(--sf-image-radius) border border-border"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm leading-6 font-semibold text-foreground">{booking.listingTitle}</p>
          {booking.resourceName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{booking.resourceName}</p>
          ) : null}
          {booking.selectedPackageName ? (
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {booking.selectedPackageName}
            </p>
          ) : null}
          <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="mt-px size-4 shrink-0" />
            <span>{booking.dateLabel}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <Clock3 aria-hidden="true" className="size-3" />
              {booking.timeLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-1">{booking.durationLabel}</span>
          </div>
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-xs leading-5 text-muted-foreground">
        <BookingFact
          icon={PackageCheck}
          label={t('bookings.bookingType')}
          value={t(`bookings.modes.${mode}`)}
        />
        <BookingFact
          icon={isInventory ? PackageCheck : Users}
          label={isInventory ? t('bookings.quantity') : t('bookings.guests')}
          value={participantCount}
        />
      </dl>

      <AttributeSpecCards cards={booking.attributes} className="mt-4" />

      {booking.listingDescription ? (
        <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          {booking.listingDescription}
        </p>
      ) : null}
    </div>
  );
}

function BookingFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
      <dt className="font-semibold text-foreground">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
