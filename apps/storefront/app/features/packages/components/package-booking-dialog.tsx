import type { PublicListingDetailWithTimezoneResponse } from '@booking/contracts';
import type { RefObject } from 'react';
import { BookingDialogFooter } from '~/components/booking-dialog-footer';
import { BookingDialogSteps } from '~/features/booking-widget/components/booking-dialog-steps';
import { BookingDialogShell } from '~/features/booking-widget/components/booking-dialog-shell';
import { useBookingDialogController } from '~/features/booking-widget/hooks/use-booking-dialog-controller';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { PublicPackageOption } from '~/lib/package-options';

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
  const { stepsProps, footerProps, changeControlledOpen } = useBookingDialogController({
    listing,
    preferredMode: 'hourly',
    today,
    controlled: { open, onOpenChange },
    controlledPackageId: selectedPackage?.id,
    returnFocusRef,
  });

  const body = (
    <BookingDialogSteps
      {...stepsProps}
      today={today}
      quotePending={footerProps.quotePending}
      packageFlow
    />
  );
  const footer = <BookingDialogFooter {...footerProps} />;

  return (
    <BookingDialogShell
      controlled={{ open, onOpenChange: changeControlledOpen }}
      title={t('packages.bookingTitle', {
        name: selectedPackage?.name ?? listing.title,
      })}
      description={t('packages.bookingDescription')}
      body={body}
      footer={footer}
    />
  );
}
