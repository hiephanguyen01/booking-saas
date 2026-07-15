'use client';

import { ExternalLinkIcon, ImageIcon, UploadIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@booking/ui/components/ui/attachment';
import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { presignAndPut, type UploadTarget } from '@booking/ui/lib/upload';
import { cn } from '@booking/ui/lib/utils';

/** Raster images the presign endpoint accepts (kept in sync with `@booking/contracts`). */
export const DEFAULT_IMAGE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

/** Favicons additionally allow `.ico`. */
export const FAVICON_ACCEPT = [
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/webp',
] as const;

const DEFAULT_MAX_SIZE_MB = 5;

export interface ImageUploadProps {
  /** Single mode → a URL string; multiple mode → a URL array. */
  value?: string | string[] | null;
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  target: UploadTarget;
  /** Same-origin resource route proxying `POST /uploads/presign`. */
  presignEndpoint?: string;
  /** Accepted MIME types (defaults to the image allowlist). */
  accept?: readonly string[];
  maxSizeMb?: number;
  /** Cap on total images in multiple mode. */
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  /** Larger dashed tile used by legal-document and identity forms. */
  variant?: 'default' | 'document';
}

interface PendingItem {
  id: string;
  name: string;
  error?: string;
}

/**
 * Controlled image uploader built on the `Attachment` primitive. Uploads each file
 * directly to storage via a presigned URL (see `lib/upload`) and calls `onChange`
 * with the resulting public URL(s) — so a `GenericForm` still submits plain strings
 * as JSON. Validates MIME + size client-side before uploading. Used both by the
 * GenericForm `file` field and directly by hand-rolled forms.
 */
export function ImageUpload({
  value,
  onChange,
  multiple = false,
  target,
  presignEndpoint,
  accept = DEFAULT_IMAGE_ACCEPT,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  maxFiles,
  disabled,
  className,
  variant = 'default',
}: ImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<PendingItem[]>([]);
  const counter = React.useRef(0);

  const urls = React.useMemo(() => normalize(value), [value]);
  const atLimit = multiple && maxFiles != null && urls.length >= maxFiles;
  const uploading = pending.some((item) => !item.error);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const chosen = multiple ? Array.from(files) : Array.from(files).slice(0, 1);
    let current = multiple ? [...urls] : [];

    for (const file of chosen) {
      if (multiple && maxFiles != null && current.length >= maxFiles) break;
      const id = `u${counter.current++}`;
      const error = validateImageUpload(file, accept, maxSizeMb);
      if (error) {
        setPending((p) => [...p, { id, name: file.name, error }]);
        continue;
      }
      setPending((p) => [...p, { id, name: file.name }]);
      try {
        const { publicUrl } = await presignAndPut(file, { target, presignEndpoint });
        const next = uploadedImageValue(current, multiple, publicUrl);
        current = normalize(next);
        onChange(next);
        setPending((p) => p.filter((x) => x.id !== id));
      } catch (e) {
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeAt(index: number): void {
    onChange(removedImageValue(urls, multiple, index));
  }

  const showTrigger = !disabled && !atLimit && (multiple || urls.length === 0);

  if (variant === 'document') {
    const previewUrl = urls[0] ?? null;
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          hidden
          disabled={disabled || uploading}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <div className="group relative h-[156px] overflow-hidden rounded-sm border border-dashed border-primary bg-white">
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt="Ảnh giấy tờ đã tải lên"
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(0)}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/95 text-[#344054] shadow-sm transition-colors hover:text-destructive"
                aria-label="Xoá ảnh"
              >
                <XIcon className="size-4" />
              </button>
            </>
          ) : uploading ? (
            <div
              className="flex size-full flex-col items-center justify-center gap-2 text-primary"
              role="status"
            >
              <Spinner />
              <span className="text-xs font-medium">Đang tải ảnh lên…</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="flex size-full items-center justify-center text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Chọn ảnh giấy tờ"
            >
              <ImageIcon className="size-8" strokeWidth={1.5} />
            </button>
          )}
        </div>
        {pending.map((item) =>
          item.error ? (
            <p key={item.id} role="alert" className="text-xs text-destructive">
              {item.error}
            </p>
          ) : null,
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        multiple={multiple}
        hidden
        disabled={disabled}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex flex-wrap gap-3">
        {urls.map((url, i) => (
          <Attachment key={`${url}-${i}`} orientation="vertical" state="done" className="w-28">
            <AttachmentMedia variant="image">
              <img src={url} alt={`Ảnh đã tải lên ${i + 1}`} />
            </AttachmentMedia>
            <AttachmentActions>
              <AttachmentAction asChild aria-label="Xem ảnh">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                </a>
              </AttachmentAction>
              <AttachmentAction
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Xoá ảnh"
                disabled={disabled}
              >
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}

        {pending.map((item) => (
          <Attachment
            key={item.id}
            orientation="vertical"
            state={item.error ? 'error' : 'uploading'}
            className="w-28"
          >
            <AttachmentMedia variant="icon">
              {item.error ? <ImageIcon /> : <Spinner data-slot="spinner" />}
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{item.name}</AttachmentTitle>
              {item.error ? <AttachmentDescription>{item.error}</AttachmentDescription> : null}
            </AttachmentContent>
            {item.error ? (
              <AttachmentActions>
                <AttachmentAction
                  type="button"
                  onClick={() => setPending((p) => p.filter((x) => x.id !== item.id))}
                  aria-label="Bỏ qua"
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            ) : null}
          </Attachment>
        ))}

        {showTrigger ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex h-auto min-h-24 w-28 flex-col items-center justify-center gap-1 border-dashed text-muted-foreground"
          >
            <UploadIcon className="size-5" />
            <span className="text-xs">Tải ảnh lên</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function validateImageUpload(
  file: File,
  accept: readonly string[],
  maxSizeMb: number,
): string | undefined {
  if (accept.length > 0 && !accept.includes(file.type)) {
    return `Định dạng không hỗ trợ: ${file.type || 'không rõ'}`;
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `Tệp vượt quá ${maxSizeMb}MB`;
  }
  return undefined;
}

function normalize(value?: string | string[] | null): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

export function uploadedImageValue(
  current: readonly string[],
  multiple: boolean,
  publicUrl: string,
): string | string[] {
  return multiple ? [...current, publicUrl] : publicUrl;
}

export function removedImageValue(
  current: readonly string[],
  multiple: boolean,
  index: number,
): string | string[] {
  const next = current.filter((_, currentIndex) => currentIndex !== index);
  return multiple ? next : (next[0] ?? '');
}
