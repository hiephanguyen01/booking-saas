import {
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_MEDIA_MAX_FILES,
  REVIEW_VIDEO_MAX_BYTES,
  reviewMediaContentTypeSchema,
  type ReviewMediaInput,
} from '@booking/contracts';
import { presignAndPutReviewMedia } from '@booking/ui/lib/upload';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NsI18n, useTranslation } from '../../../lib/i18n';

type UploadState = 'ready' | 'uploading' | 'uploaded' | 'error';

export interface SelectedReviewMedia {
  id: string;
  file: File;
  kind: 'image' | 'video';
  previewUrl: string;
  state: UploadState;
  uploaded?: ReviewMediaInput;
}

export function useReviewMedia(open: boolean) {
  const { t } = useTranslation(NsI18n.Account);
  const [media, setMedia] = useState<SelectedReviewMedia[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const mediaRef = useRef<SelectedReviewMedia[]>([]);

  const commitMedia = useCallback((next: SelectedReviewMedia[]) => {
    mediaRef.current = next;
    setMedia(next);
  }, []);

  const resetMedia = useCallback(() => {
    for (const item of mediaRef.current) URL.revokeObjectURL(item.previewUrl);
    commitMedia([]);
    setFileError(null);
  }, [commitMedia]);

  useEffect(
    () => () => {
      for (const item of mediaRef.current) URL.revokeObjectURL(item.previewUrl);
      mediaRef.current = [];
    },
    [],
  );

  useEffect(() => {
    if (!open) resetMedia();
  }, [open, resetMedia]);

  const addFiles = useCallback(
    (files: File[]) => {
      setFileError(null);
      const current = mediaRef.current;
      if (current.length + files.length > REVIEW_MEDIA_MAX_FILES) {
        setFileError(t('reviews.dialog.tooManyFiles'));
        return;
      }

      const next: SelectedReviewMedia[] = [];
      for (const file of files) {
        const parsedType = reviewMediaContentTypeSchema.safeParse(file.type);
        if (!parsedType.success) {
          setFileError(t('reviews.dialog.unsupportedFile'));
          continue;
        }

        const kind = parsedType.data.startsWith('image/') ? 'image' : 'video';
        if (kind === 'image' && file.size > REVIEW_IMAGE_MAX_BYTES) {
          setFileError(t('reviews.dialog.imageTooLarge'));
          continue;
        }
        if (kind === 'video' && file.size > REVIEW_VIDEO_MAX_BYTES) {
          setFileError(t('reviews.dialog.videoTooLarge'));
          continue;
        }

        next.push({
          id: crypto.randomUUID(),
          file,
          kind,
          previewUrl: URL.createObjectURL(file),
          state: 'ready',
        });
      }

      if (next.length) {
        commitMedia([...current, ...next]);
      }
    },
    [commitMedia, t],
  );

  const removeFile = useCallback(
    (id: string) => {
      const current = mediaRef.current;
      const removed = current.find((item) => item.id === id);
      if (!removed) return;

      URL.revokeObjectURL(removed.previewUrl);
      commitMedia(current.filter((item) => item.id !== id));
    },
    [commitMedia],
  );

  const uploadAll = useCallback(
    async (bookingId: string): Promise<ReviewMediaInput[] | null> => {
      setFileError(null);
      const snapshot = mediaRef.current;
      commitMedia(snapshot.map((item) => (item.uploaded ? item : { ...item, state: 'uploading' })));

      const uploaded: ReviewMediaInput[] = [];
      let failed = false;
      for (const item of snapshot) {
        if (item.uploaded) {
          uploaded.push(item.uploaded);
          continue;
        }

        try {
          const result = await presignAndPutReviewMedia(item.file, bookingId);
          uploaded.push(result);
          commitMedia(
            mediaRef.current.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, state: 'uploaded', uploaded: result }
                : candidate,
            ),
          );
        } catch {
          failed = true;
          commitMedia(
            mediaRef.current.map((candidate) =>
              candidate.id === item.id ? { ...candidate, state: 'error' } : candidate,
            ),
          );
        }
      }

      if (failed) {
        setFileError(t('reviews.dialog.uploadFailed'));
        return null;
      }
      return uploaded;
    },
    [commitMedia, t],
  );

  return {
    media,
    fileError,
    mediaUploading: media.some((item) => item.state === 'uploading'),
    addFiles,
    removeFile,
    uploadAll,
  };
}
