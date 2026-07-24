import type { PublicListingDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays } from 'lucide-react';
import { BookingDialogFooter } from '../../../components/booking-dialog-footer';
import type { BookingMode, RoomOption } from '../listing-group-types';
import { RoomBookingDialogShell } from './room-booking-dialog-shell';
import {
  RoomBookingDialogSteps,
  type ListingBookingMode,
} from './room-booking-dialog-steps';
import { useListingBookingDialogController } from './use-listing-booking-dialog-controller';

export type { ListingBookingMode } from './room-booking-dialog-steps';

export function ListingBookingDialog({
  listing,
  groupSlug,
  preferredMode,
}: {
  listing: PublicListingDetailResponse;
  groupSlug?: string;
  preferredMode: ListingBookingMode;
}) {
  const { triggerLabel, shellProps, stepsProps, footerProps } =
    useListingBookingDialogController({ listing, groupSlug, preferredMode });
  const trigger = (
    <Button className="w-full">
      <CalendarDays aria-hidden="true" /> {triggerLabel}
    </Button>
  );
  const body = <RoomBookingDialogSteps {...stepsProps} />;
  const footer = <BookingDialogFooter {...footerProps} />;

  return <RoomBookingDialogShell {...shellProps} trigger={trigger} body={body} footer={footer} />;
}

export function RoomBookingDialog({
  option,
  groupSlug,
  preferredMode,
}: {
  option: RoomOption;
  groupSlug: string;
  preferredMode: BookingMode;
}) {
  return (
    <ListingBookingDialog
      listing={option.detail}
      groupSlug={groupSlug}
      preferredMode={preferredMode === 'daily' ? 'daily' : 'hourly'}
    />
  );
}
