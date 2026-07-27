import type { PublicListingDetailWithTimezoneResponse } from '@booking/contracts';
import type { RefObject } from 'react';
import { BookingDialogFooter } from '../../components/booking-dialog-footer';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { PublicPackageOption } from '../../lib/package-options';
import { PackageBookingDialogShell } from './package-booking-dialog-shell';
import { PackageBookingDialogSteps } from './package-booking-dialog-steps';
import { usePackageBookingDialogController } from './use-package-booking-dialog-controller';

export function PackageBookingDialog({
  open,
  onOpenChange,
  returnFocusRef,
  selectedPackage,
  listing,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  selectedPackage: PublicPackageOption | null;
  listing: PublicListingDetailWithTimezoneResponse;
  today: string;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const controller = usePackageBookingDialogController({
    listing,
    selectedPackage,
    onOpenChange,
    returnFocusRef,
  });

  const body = (
    <PackageBookingDialogSteps
      date={controller.date}
      timezone={controller.timezone}
      today={today}
      availabilityPending={controller.availabilityPending}
      hasAvailability={controller.hasAvailability}
      availabilityError={controller.availabilityError}
      slots={controller.slots}
      selectedSlots={controller.selectedSlots}
      quotePending={controller.quotePending}
      quoteError={controller.quoteError}
      selectionUnavailable={controller.selectionUnavailable}
      onSelectDate={controller.selectDate}
      onChangeDate={controller.changeDate}
      onToggleSlot={controller.toggleSlot}
      onRetryAvailability={controller.retryAvailability}
      onRetryQuote={controller.retryQuote}
    />
  );
  const footer = (
    <BookingDialogFooter
      selectionSummary={controller.selectionSummary}
      quote={controller.quoteSubtotal}
      quotePending={controller.quotePending}
      bookingHref={controller.bookingHref}
      disabledLabel={
        controller.quotePending
          ? t('group.calculatingPrice')
          : controller.date
            ? t('group.chooseHoursToContinue')
            : t('group.chooseDayToContinue')
      }
    />
  );

  return (
    <PackageBookingDialogShell
      open={open}
      onOpenChange={controller.changeOpen}
      title={t('packages.bookingTitle', {
        name: selectedPackage?.name ?? listing.title,
      })}
      description={t('packages.bookingDescription')}
      body={body}
      footer={footer}
    />
  );
}
