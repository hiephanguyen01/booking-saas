import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useFetcher } from 'react-router';
import { DISPUTE_REASON_MIN } from '~/features/account/lib/booking-dispute';
import { createSubmissionLock } from '~/lib/submission-lock';
import type { BookingDisputeActionData } from '~/features/account/server/account-booking-detail-route.server';

export function useDisputeDialogController({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<BookingDisputeActionData>();
  const submitLockRef = useRef(createSubmissionLock());
  const fetcherWasBusyRef = useRef(false);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= DISPUTE_REASON_MIN;
  const submitting = fetcher.state !== 'idle';
  const isOwnReply = fetcher.data?.intent === 'dispute';
  const serverError = isOwnReply && !fetcher.data?.ok ? (fetcher.data?.error ?? null) : null;

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
    if (fetcher.state === 'idle' && fetcher.data?.intent === 'dispute' && fetcher.data.ok) {
      onOpenChange(false);
    }
  }, [fetcher.data, fetcher.state, onOpenChange]);

  useEffect(() => {
    if (!open) {
      fetcherWasBusyRef.current = false;
      submitLockRef.current.release();
      setReason('');
      setEvidence('');
    }
  }, [open]);

  function changeOpen(nextOpen: boolean): void {
    if (!submitting) onOpenChange(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (!reasonValid || !submitLockRef.current.tryAcquire()) {
      event.preventDefault();
    }
  }

  return {
    changeOpen,
    evidence,
    fetcher,
    handleSubmit,
    reason,
    reasonValid,
    serverError,
    setEvidence,
    setReason,
    submitting,
    trimmedReason,
  };
}
