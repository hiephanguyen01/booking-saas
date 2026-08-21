'use client';

import { CheckCircle2, FileImage, LoaderCircle, UploadIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import { presignAndPutPrivateDocument } from '@booking/ui/lib/upload';
import { cn } from '@booking/ui/lib/utils';

export interface PrivateDocumentUploadProps {
  value?: string | null;
  onChange: (key: string) => void;
  presignEndpoint: string;
  accept: readonly string[];
  maxSizeMb: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function PrivateDocumentUpload({
  value,
  onChange,
  presignEndpoint,
  accept,
  maxSizeMb,
  disabled,
  label = 'Tài liệu',
  className,
}: PrivateDocumentUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const replacePreview = React.useCallback((next: string | null) => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return next;
    });
  }, []);

  React.useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    controllerRef.current?.abort();
    setError(null);

    const validationError = validatePrivateDocument(file, accept, maxSizeMb);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const localPreview = URL.createObjectURL(file);
    replacePreview(localPreview);
    const controller = new AbortController();
    controllerRef.current = controller;
    setUploading(true);

    try {
      const uploaded = await presignAndPutPrivateDocument(file, {
        presignEndpoint,
        signal: controller.signal,
      });
      onChange(uploaded.key);
    } catch (caught) {
      if (!controller.signal.aborted) {
        replacePreview(null);
        setError(caught instanceof Error ? caught.message : 'Không thể tải tài liệu.');
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setUploading(false);
      }
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function clear(): void {
    controllerRef.current?.abort();
    controllerRef.current = null;
    replacePreview(null);
    setUploading(false);
    setError(null);
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const hasDocument = Boolean(value);

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        hidden
        disabled={disabled || uploading}
        onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
      />

      <div className="overflow-hidden rounded-lg border bg-background">
        {previewUrl ? (
          <div className="relative aspect-[4/3] bg-muted">
            <Image src={previewUrl} alt={`Xem trước ${label}`} className="size-full object-contain" />
          </div>
        ) : hasDocument ? (
          <div className="flex min-h-32 items-center justify-center gap-3 p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
            <span>Tài liệu đã tải lên an toàn</span>
          </div>
        ) : (
          <button
            type="button"
            className="flex min-h-32 w-full flex-col items-center justify-center gap-2 p-5 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            <FileImage className="size-6" aria-hidden="true" />
            <span>Chọn ảnh tài liệu</span>
            <span className="text-xs">Tối đa {maxSizeMb} MB</span>
          </button>
        )}

        {(hasDocument || previewUrl) && !uploading ? (
          <div className="flex gap-2 border-t p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon /> Thay ảnh
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={clear}>
              <XIcon /> Xoá
            </Button>
          </div>
        ) : null}

        {uploading ? (
          <div className="flex items-center gap-2 border-t p-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Đang tải tài liệu…
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function validatePrivateDocument(
  file: File,
  accept: readonly string[],
  maxSizeMb: number,
): string | null {
  if (!accept.includes(file.type)) return 'Định dạng tài liệu không được hỗ trợ.';
  if (file.size <= 0) return 'Tài liệu không được để trống.';
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `Tài liệu phải nhỏ hơn hoặc bằng ${maxSizeMb} MB.`;
  }
  return null;
}
