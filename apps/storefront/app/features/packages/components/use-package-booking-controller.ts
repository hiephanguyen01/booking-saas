import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

const STALE_SELECTION_PARAMS = [
  'day',
  'date',
  'start',
  'end',
  'startTime',
  'endTime',
  'from',
  'to',
  'qty',
  'quantity',
] as const;

type PackageBookingOption = {
  id: string;
  photos: string[];
};

export function usePackageBookingController<TPackage extends PackageBookingOption>(
  packages: TPackage[],
  listingPhotos: string[],
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const bookingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const galleryPhotos = selectedPackage?.photos.length ? selectedPackage.photos : listingPhotos;

  function clearStaleSelectionParams(params: URLSearchParams): void {
    for (const key of STALE_SELECTION_PARAMS) params.delete(key);
  }

  function selectPackage(packageId: string, trigger: HTMLButtonElement): void {
    bookingTriggerRef.current = trigger;
    setSelectedPackageId(packageId);
    const next = new URLSearchParams(searchParams);
    next.set('packageId', packageId);
    clearStaleSelectionParams(next);
    setBookingOpen(true);
    setSearchParams(next, { preventScrollReset: true });
  }

  function changeBookingOpen(open: boolean): void {
    setBookingOpen(open);
    if (open) return;
    setSelectedPackageId(null);

    const next = new URLSearchParams(searchParams);
    next.delete('packageId');
    clearStaleSelectionParams(next);
    setSearchParams(next, { preventScrollReset: true });
  }

  return {
    bookingOpen,
    selectedPackage,
    galleryPhotos,
    bookingTriggerRef,
    selectPackage,
    changeBookingOpen,
  };
}
