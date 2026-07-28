import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useFetcher } from 'react-router';
import { createSubmissionLock } from '~/lib/submission-lock';
import type { BookingCancellationActionData } from '~/features/account/server/booking-cancellation.server';

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
  const submitLockRef = useRef(createSubmissionLock());
  const fetcherWasBusyRef = useRef(false);
  const [selected, setSelected] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const reason = selected === 'other' ? otherReason.trim() : selected;
  const submitting = fetcher.state !== 'idle';
  const serverError =
    fetcher.data?.bookingCode === bookingCode && !fetcher.data.ok ? fetcher.data.error : null;

  useEffect(() => {
    if (fetcher.state !== 'idle') {
      fetcherWasBusyRef.current = true;
      return;
    }

    if (fetcherWasBusyRef.current) {
      fetcherWasBusyRef.current = false;
      submitLockRef.current.release();
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.bookingCode === bookingCode) {
      onOpenChange(false);
    }
  }, [bookingCode, fetcher.data, fetcher.state, onOpenChange]);

  useEffect(() => {
    if (!open) {
      fetcherWasBusyRef.current = false;
      submitLockRef.current.release();
      setSelected('');
      setOtherReason('');
    }
  }, [bookingCode, open]);

  function changeOpen(nextOpen: boolean): void {
    if (!submitting) onOpenChange(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (!reason || !submitLockRef.current.tryAcquire()) {
      event.preventDefault();
    }
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
    handleSubmit,
  };
}
