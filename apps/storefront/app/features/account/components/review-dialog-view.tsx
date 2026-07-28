import { REVIEW_MEDIA_MAX_FILES } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { cn } from '@booking/ui/lib/utils';
import { ImagePlus, LoaderCircle, Star, Upload, X } from 'lucide-react';
import { useRef, type DragEvent } from 'react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { SelectedReviewMedia } from './review-dialog-media';

export function ReviewDialogView({
  open,
  reviewTitle,
  rating,
  hoverRating,
  content,
  media,
  fileError,
  actionError,
  submitting,
  formValid,
  onOpenChange,
  onRatingChange,
  onHoverRatingChange,
  onContentChange,
  onAddFiles,
  onRemoveFile,
  onSubmit,
}: {
  open: boolean;
  reviewTitle: string;
  rating: number;
  hoverRating: number;
  content: string;
  media: SelectedReviewMedia[];
  fileError: string | null;
  actionError: string | null;
  submitting: boolean;
  formValid: boolean;
  onOpenChange: (open: boolean) => void;
  onRatingChange: (rating: number) => void;
  onHoverRatingChange: (rating: number) => void;
  onContentChange: (content: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!submitting) onAddFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
          <DialogTitle className="text-xl leading-7">{t('reviews.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('reviews.dialog.description', { title: reviewTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset disabled={submitting}>
            <legend className="mb-3 text-sm font-semibold">{t('reviews.dialog.rating')}</legend>
            <div
              className="flex w-fit gap-1"
              onPointerLeave={() => onHoverRatingChange(0)}
              role="radiogroup"
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= (hoverRating || rating);
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={t('reviews.dialog.ratingLabel', { rating: value })}
                    onPointerEnter={() => onHoverRatingChange(value)}
                    onFocus={() => onHoverRatingChange(value)}
                    onBlur={() => onHoverRatingChange(0)}
                    onClick={() => onRatingChange(value)}
                    className="rounded-md p-1 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      className={cn(
                        'size-8',
                        active ? 'text-amber-500' : 'text-muted-foreground/35',
                      )}
                      fill={active ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="review-content" className="text-sm font-semibold">
                {t('reviews.dialog.content')}
              </label>
              <span className="text-xs text-muted-foreground">
                {t('reviews.dialog.characters', { count: content.length })}
              </span>
            </div>
            <Textarea
              id="review-content"
              value={content}
              onChange={(event) => onContentChange(event.target.value.slice(0, 2000))}
              placeholder={t('reviews.dialog.placeholder')}
              disabled={submitting}
            />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">{t('reviews.dialog.uploadTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('reviews.dialog.uploadRules')}
              </p>
            </div>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/[0.025] px-5 py-7 text-center"
            >
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                <Upload className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">{t('reviews.dialog.uploadHint')}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={submitting || media.length >= REVIEW_MEDIA_MAX_FILES}
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                {t('reviews.dialog.chooseFiles')}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime"
                className="sr-only"
                disabled={submitting}
                onChange={(event) => {
                  onAddFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
            </div>

            {media.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((item) => (
                  <div
                    key={item.id}
                    className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {item.kind === 'image' ? (
                      <img
                        src={item.previewUrl}
                        alt={t('reviews.dialog.imagePreview', { name: item.file.name })}
                        className="size-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.previewUrl}
                        aria-label={t('reviews.dialog.videoPreview', { name: item.file.name })}
                        muted
                        playsInline
                        className="size-full object-cover"
                      />
                    )}
                    {item.state === 'uploading' ? (
                      <span className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                        <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                      </span>
                    ) : null}
                    {item.state === 'error' ? (
                      <span className="absolute inset-x-0 bottom-0 bg-destructive px-2 py-1 text-center text-[11px] text-destructive-foreground">
                        {t('reviews.dialog.uploadFailed')}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onRemoveFile(item.id)}
                      disabled={submitting}
                      aria-label={t('reviews.dialog.removeFile', { name: item.file.name })}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/65 text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {fileError || actionError ? (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {fileError ?? actionError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="grid grid-cols-2 gap-3 border-t border-border px-5 py-4 sm:grid-cols-2 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('reviews.dialog.cancel')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!formValid || submitting}>
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {submitting ? t('reviews.dialog.submitting') : t('reviews.dialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
