import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import type { BookingCancellationActionData } from '../server/booking-cancellation.server';

export function useCancelBookingDialogController({
  bookingCode,
  open,
  onOpenChange,
}: {
  bookingCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<BookingCancellationActionData>();
  const [selected, setSelected] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const reason = selected === 'other' ? otherReason.trim() : selected;
  const submitting = fetcher.state !== 'idle';
  const serverError =
    fetcher.data?.bookingCode === bookingCode && !fetcher.data.ok ? fetcher.data.error : null;

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.bookingCode === bookingCode) {
      onOpenChange(false);
    }
  }, [bookingCode, fetcher.data, fetcher.state, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setSelected('');
      setOtherReason('');
    }
  }, [bookingCode, open]);

  function changeOpen(nextOpen: boolean): void {
    if (!submitting) onOpenChange(nextOpen);
  }

  return {
    fetcher,
    selected,
    setSelected,
    otherReason,
    setOtherReason,
    reason,
    submitting,
    serverError,
    changeOpen,
  };
}
