import type { CustomerReviewItem } from '@booking/contracts';
import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { useReviewMedia } from './review-dialog-media';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;
type ReviewActionData = { ok: boolean; error: string | null; bookingId: string | null };

type UseReviewDialogControllerOptions = {
  review: PendingReview | null;
  open: boolean;
  action?: string;
  onOpenChange: (open: boolean) => void;
};

export function useReviewDialogController({
  review,
  open,
  action,
  onOpenChange,
}: UseReviewDialogControllerOptions) {
  const { t } = useTranslation(NsI18n.Account);
  const fetcher = useFetcher<ReviewActionData>();
  const submitInFlightRef = useRef(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState('');
  const { media, fileError, mediaUploading, addFiles, removeFile, uploadAll } =
    useReviewMedia(open);
  const submitting = fetcher.state !== 'idle' || mediaUploading;
  const formValid = rating > 0 && content.trim().length >= 10 && content.trim().length <= 2000;

  useEffect(() => {
    if (fetcher.state === 'idle') {
      submitInFlightRef.current = false;
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.bookingId === review?.bookingId) {
      onOpenChange(false);
    }
  }, [fetcher.data, fetcher.state, onOpenChange, review?.bookingId]);

  useEffect(() => {
    if (!open) {
      submitInFlightRef.current = false;
      setRating(0);
      setHoverRating(0);
      setContent('');
    }
  }, [open]);

  async function submit(): Promise<void> {
    if (!review || !formValid || submitting || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    let submitted = false;
    try {
      const uploaded = await uploadAll(review.bookingId);
      if (!uploaded) return;

      const formData = new FormData();
      formData.set('intent', 'review');
      formData.set('bookingId', review.bookingId);
      formData.set('rating', String(rating));
      formData.set('content', content);
      formData.set('media', JSON.stringify(uploaded));
      fetcher.submit(formData, { method: 'post', action });
      submitted = true;
    } finally {
      if (!submitted) {
        submitInFlightRef.current = false;
      }
    }
  }

  const actionData = fetcher.data;
  let actionError: string | null = null;
  if (actionData && actionData.bookingId === review?.bookingId && !actionData.ok) {
    actionError =
      actionData.error === 'INVALID_REVIEW'
        ? t('reviews.dialog.validation')
        : t('reviews.dialog.submitFailed');
  }

  return {
    rating,
    hoverRating,
    content,
    media,
    fileError,
    actionError,
    submitting,
    formValid,
    onOpenChange,
    onRatingChange: setRating,
    onHoverRatingChange: setHoverRating,
    onContentChange: setContent,
    onAddFiles: addFiles,
    onRemoveFile: removeFile,
    onSubmit: () => void submit(),
  };
}
