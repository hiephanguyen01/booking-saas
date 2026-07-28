import type { PublicListingDetailWithTimezoneResponse } from '@booking/contracts';
import type { MediaViewerItem } from '@booking/ui/components/media/media-viewer-dialog';
import { PackageMediaViewerDialog } from '@booking/ui/components/media/package-media-viewer-dialog';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays } from 'lucide-react';
import { useRef, useState } from 'react';
import { BookingDialogFooter } from '~/components/booking-dialog-footer';
import { PackageMediaDetails } from '~/components/package-media-details';
import {
  BookingDialogSteps,
  type ListingBookingMode,
} from '~/features/booking-widget/components/booking-dialog-steps';
import { BookingDialogShell } from '~/features/booking-widget/components/booking-dialog-shell';
import { useBookingDialogController } from '~/features/booking-widget/hooks/use-booking-dialog-controller';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import type { BookingMode, RoomOption } from '~/features/listing-group/lib/listing-group-types';

export type { ListingBookingMode } from '~/features/booking-widget/components/booking-dialog-steps';

export function ListingBookingDialog({
  listing,
  groupSlug,
  preferredMode,
  today,
}: {
  listing: PublicListingDetailWithTimezoneResponse;
  groupSlug?: string;
  preferredMode: ListingBookingMode;
  today: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const viewerLabels = useMediaViewerLabels();
  const [activePackageMediaIndex, setActivePackageMediaIndex] = useState<number | null>(null);
  const mediaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { triggerLabel, shellProps, stepsProps, footerProps } = useBookingDialogController({
    listing,
    groupSlug,
    preferredMode,
    today,
  });
  const selectedPackage = stepsProps.selectedPackage;
  const galleryPhotos = selectedPackage?.photos.length ? selectedPackage.photos : listing.photos;
  const mediaItems: MediaViewerItem[] = selectedPackage
    ? galleryPhotos.map((photo, index) => ({
        kind: 'image',
        url: photo,
        alt: t('group.photoAlt', { title: selectedPackage.name, index: index + 1 }),
      }))
    : [];

  function openPackageMedia(index: number, trigger: HTMLButtonElement): void {
    mediaTriggerRef.current = trigger;
    setActivePackageMediaIndex(index);
  }

  function closePackageMedia(): void {
    setActivePackageMediaIndex(null);
  }

  const trigger = (
    <Button className="w-full">
      <CalendarDays aria-hidden="true" /> {triggerLabel}
    </Button>
  );
  const body = (
    <BookingDialogSteps
      {...stepsProps}
      today={today}
      quotePending={footerProps.quotePending}
      onOpenPackageMedia={openPackageMedia}
    />
  );
  const footer = <BookingDialogFooter {...footerProps} />;

  return (
    <>
      <BookingDialogShell
        {...shellProps}
        onDesktopOpenChange={(open) => {
          shellProps.onDesktopOpenChange(open);
          if (!open) closePackageMedia();
        }}
        onMobileOpenChange={(open) => {
          shellProps.onMobileOpenChange(open);
          if (!open) closePackageMedia();
        }}
        trigger={trigger}
        body={body}
        footer={footer}
      />

      <PackageMediaViewerDialog
        open={activePackageMediaIndex !== null && Boolean(selectedPackage)}
        items={mediaItems}
        activeIndex={activePackageMediaIndex ?? 0}
        onOpenChange={(open) => {
          if (!open) closePackageMedia();
        }}
        onActiveIndexChange={setActivePackageMediaIndex}
        labels={viewerLabels}
        title={selectedPackage?.name ?? listing.title}
        description={t('packages.mediaViewerDescription', {
          name: selectedPackage?.name ?? listing.title,
        })}
        returnFocusRef={mediaTriggerRef}
        details={
          selectedPackage ? <PackageMediaDetails item={selectedPackage} listing={listing} /> : null
        }
      />
    </>
  );
}

export function RoomBookingDialog({
  option,
  groupSlug,
  preferredMode,
  today,
}: {
  option: RoomOption;
  groupSlug: string;
  preferredMode: BookingMode;
  today: string;
}) {
  return (
    <ListingBookingDialog
      listing={option.detail}
      groupSlug={groupSlug}
      preferredMode={preferredMode === 'daily' ? 'daily' : 'hourly'}
      today={today}
    />
  );
}
