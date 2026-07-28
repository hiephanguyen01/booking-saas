import type { HourlySlot } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useState } from 'react';
import {
  checkoutHref,
  slotInterval,
  toggleContiguousSlot,
} from '~/features/listing-group/lib/listing-group-utils';

export function useSlotPickerController({
  locale,
  listingSlug,
  requestedStart,
  requestedEnd,
  contiguousError,
}: {
  locale: Locale;
  listingSlug: string;
  requestedStart?: string | null;
  requestedEnd?: string | null;
  contiguousError: string;
}) {
  const requestedInterval =
    requestedStart && requestedEnd ? { start: requestedStart, end: requestedEnd } : null;
  const [selected, setSelected] = useState<HourlySlot[]>([]);
  const [useRequestedInterval, setUseRequestedInterval] = useState(Boolean(requestedInterval));
  const [expanded, setExpanded] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const interval =
    useRequestedInterval && requestedInterval ? requestedInterval : slotInterval(selected);
  const bookingHref = interval
    ? checkoutHref({
        locale,
        listingSlug,
        mode: 'hourly',
        start: interval.start,
        end: interval.end,
      })
    : null;

  function toggleSlot(slot: HourlySlot): void {
    if (!slot.available) return;

    setUseRequestedInterval(false);
    const result = toggleContiguousSlot(selected, slot);
    setSelected(result.slots);
    setSelectionError(result.changed ? '' : contiguousError);
  }

  function clearSelection(): void {
    setSelected([]);
    setUseRequestedInterval(false);
    setSelectionError('');
  }

  return {
    bookingHref,
    clearSelection,
    expanded,
    selected,
    selectionError,
    setExpanded,
    toggleSlot,
    useRequestedInterval,
  };
}
