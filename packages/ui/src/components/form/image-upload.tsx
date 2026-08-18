'use client';

import {
  ExternalLinkIcon,
  ImageIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
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
import {
  SortableCollection,
  SortableHandle,
  SortableItem,
  type SortableItemState,
} from '@booking/ui/components/form/sortable-collection';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { Image } from '@booking/ui/components/media/image';
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
  /** Show accessible controls for changing the order in multiple mode. */
  reorderable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Larger dashed tile used by legal-document and identity forms. */
  variant?: 'default' | 'document' | 'gallery' | 'compact-gallery';
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
  reorderable = false,
  disabled,
  className,
  variant = 'default',
}: ImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<PendingItem[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const counter = React.useRef(0);

  const urls = React.useMemo(() => normalize(value), [value]);
  const imageItems = useStableImageItems(urls);
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

  function move(fromIndex: number, toIndex: number): void {
    if (
      !multiple ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= urls.length ||
      toIndex >= urls.length
    )
      return;
    const next = [...urls];
    const [item] = next.splice(fromIndex, 1);
    if (!item) return;
    next.splice(toIndex, 0, item);
    onChange(next);
  }

  const showTrigger = !disabled && !atLimit && (multiple || urls.length === 0);

  if (variant === 'gallery') {
    const remaining = maxFiles == null ? null : Math.max(0, maxFiles - urls.length);
    const galleryGrid = (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {imageItems.map((item, index) => (
          <SortableImageItem
            key={item.id}
            id={item.id}
            index={index}
            sortable={reorderable}
            disabled={disabled || uploading || urls.length < 2}
          >
            {({ itemRef, handleRef, isDragging }) => (
              <div
                ref={itemRef}
                className={cn(
                  'group/image relative aspect-[4/3] min-w-0 overflow-hidden rounded-lg border bg-muted shadow-xs transition',
                  isDragging && 'z-10 opacity-45 ring-2 ring-primary/40',
                )}
              >
                <Image
                  src={item.url}
                  alt={`Ảnh tin đăng ${index + 1}`}
                  className="size-full object-cover transition duration-300 group-hover/image:scale-[1.02]"
                />
                {reorderable && index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-background/95 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">
                    Ảnh đại diện
                  </span>
                ) : null}
                {reorderable ? (
                  <SortableHandle
                    ref={handleRef}
                    label={`Kéo để sắp xếp ảnh ${index + 1}`}
                    disabled={disabled || uploading || urls.length < 2}
                    className="absolute right-2 top-2 z-10 rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                  />
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 pt-8">
                  <GalleryAction
                    label={`Xoá ảnh ${index + 1}`}
                    disabled={disabled || uploading}
                    onClick={() => removeAt(index)}
                  >
                    <XIcon />
                  </GalleryAction>
                </div>
              </div>
            )}
          </SortableImageItem>
        ))}

        {pending.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex aspect-[4/3] min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center',
              item.error
                ? 'border-destructive/40 bg-destructive/5 text-destructive'
                : 'bg-muted/20 text-muted-foreground',
            )}
            role={item.error ? 'alert' : 'status'}
          >
            {item.error ? <ImageIcon className="size-5" /> : <Spinner />}
            <span className="max-w-full truncate text-xs font-medium">{item.name}</span>
            {item.error ? (
              <>
                <span className="text-[11px] leading-4">{item.error}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPending((items) => items.filter((x) => x.id !== item.id))}
                >
                  Bỏ qua
                </Button>
              </>
            ) : null}
          </div>
        ))}
      </div>
    );

    return (
      <div className={cn('space-y-4', className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          multiple={multiple}
          hidden
          disabled={disabled || uploading || atLimit}
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {showTrigger ? (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled && !uploading) setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!disabled && !uploading) void handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              'group flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center outline-none transition-all',
              'border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/[0.03]',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              dragging && 'border-primary bg-primary/[0.06] ring-[3px] ring-primary/15',
              uploading && 'cursor-wait opacity-70',
            )}
          >
            <span className="mb-3 grid size-11 place-items-center rounded-full border bg-background text-primary shadow-sm transition-transform group-hover:-translate-y-0.5">
              {uploading ? <Spinner /> : <UploadIcon className="size-5" />}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {uploading ? 'Đang tải ảnh lên…' : 'Kéo thả ảnh vào đây'}
            </span>
            <span className="mt-1 text-xs leading-5 text-muted-foreground">
              hoặc nhấn để chọn ảnh · PNG, JPG, WebP, AVIF · tối đa {maxSizeMb}MB/ảnh
            </span>
            {remaining != null ? (
              <span className="mt-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                Còn {remaining} vị trí
              </span>
            ) : null}
          </button>
        ) : (
          <div className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Đã đạt giới hạn {maxFiles} ảnh. Xoá một ảnh để tải ảnh khác lên.
          </div>
        )}

        {urls.length > 0 || pending.length > 0 ? (
          reorderable ? (
            <SortableCollection onMove={move} announcementLabel="Ảnh">
              {galleryGrid}
            </SortableCollection>
          ) : (
            galleryGrid
          )
        ) : null}

        {urls.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageIcon className="size-3.5 text-primary" aria-hidden />
            Ảnh đầu tiên được dùng làm ảnh đại diện. Kéo tay nắm trên ảnh để đổi thứ tự.
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === 'compact-gallery') {
    const compactGrid = (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {imageItems.map((item, index) => (
          <SortableImageItem
            key={item.id}
            id={item.id}
            index={index}
            sortable={reorderable}
            disabled={disabled || uploading || urls.length < 2}
          >
            {({ itemRef, handleRef, isDragging }) => (
              <div
                ref={itemRef}
                className={cn(
                  'group/image relative aspect-[4/3] min-w-0 overflow-hidden rounded-xl border bg-muted shadow-xs transition',
                  isDragging && 'z-10 opacity-45 ring-2 ring-primary/40',
                )}
              >
                <Image
                  src={item.url}
                  alt={`Ảnh gói ${index + 1}`}
                  className="size-full object-cover transition-transform duration-200 group-hover/image:scale-[1.02]"
                />
                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm">
                    Ảnh đại diện
                  </span>
                ) : null}
                {reorderable ? (
                  <SortableHandle
                    ref={handleRef}
                    label={`Kéo để sắp xếp ảnh gói ${index + 1}`}
                    disabled={disabled || uploading || urls.length < 2}
                    className="absolute right-1 top-1 z-10 rounded-lg bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background"
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 pt-8 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/image:opacity-100 [@media(hover:hover)]:group-hover/image:opacity-100">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Xem ảnh gói ${index + 1}`}
                    title={`Xem ảnh gói ${index + 1}`}
                    className={compactGalleryActionClassName}
                  >
                    <ExternalLinkIcon aria-hidden />
                  </a>
                  <button
                    type="button"
                    aria-label={`Xoá ảnh gói ${index + 1}`}
                    title={`Xoá ảnh gói ${index + 1}`}
                    disabled={disabled || uploading}
                    onClick={() => removeAt(index)}
                    className={cn(
                      compactGalleryActionClassName,
                      'hover:bg-destructive hover:text-destructive-foreground focus-visible:bg-destructive focus-visible:text-destructive-foreground',
                    )}
                  >
                    <XIcon aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </SortableImageItem>
        ))}

        {pending.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex aspect-[4/3] min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed p-3 text-center',
              item.error
                ? 'border-destructive/40 bg-destructive/5 text-destructive'
                : 'bg-muted/20 text-muted-foreground',
            )}
            role={item.error ? 'alert' : 'status'}
          >
            {item.error ? <ImageIcon className="size-5 shrink-0" /> : <Spinner />}
            <span className="max-w-full truncate text-xs font-semibold">{item.name}</span>
            {item.error ? (
              <>
                <span className="line-clamp-2 text-[10px] leading-4">{item.error}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-destructive hover:text-destructive"
                  onClick={() => setPending((items) => items.filter((x) => x.id !== item.id))}
                >
                  Bỏ qua
                </Button>
              </>
            ) : (
              <span className="text-[10px]">Đang tải lên…</span>
            )}
          </div>
        ))}

        {showTrigger ? (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled && !uploading) setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!disabled && !uploading) void handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              'group/upload flex aspect-[4/3] min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/15 p-3 text-center text-muted-foreground outline-none transition',
              'hover:border-primary/50 hover:bg-primary/[0.03] hover:text-primary',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              dragging && 'border-primary bg-primary/[0.06] text-primary ring-[3px] ring-primary/15',
              uploading && 'cursor-wait opacity-70',
            )}
          >
            <span className="grid size-10 place-items-center rounded-full border bg-background shadow-xs transition-transform group-hover/upload:-translate-y-0.5">
              {uploading ? <Spinner /> : <UploadIcon className="size-5" aria-hidden />}
            </span>
            <span className="text-xs font-semibold">
              {uploading ? 'Đang tải ảnh…' : 'Thêm ảnh'}
            </span>
          </button>
        ) : null}
      </div>
    );

    return (
      <div className={cn('space-y-3', className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          multiple={multiple}
          hidden
          disabled={disabled || uploading || atLimit}
          onChange={(event) => void handleFiles(event.target.files)}
        />

        {reorderable ? (
          <SortableCollection onMove={move} announcementLabel="Ảnh gói">
            {compactGrid}
          </SortableCollection>
        ) : (
          compactGrid
        )}

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {maxFiles == null ? `${urls.length} ảnh` : `${urls.length}/${maxFiles} ảnh`}
          </span>
          {atLimit ? (
            <span>Đã đạt giới hạn.</span>
          ) : reorderable && urls.length > 1 ? (
            <span>Kéo tay nắm để sắp xếp.</span>
          ) : urls.length === 1 ? (
            <span>Ảnh đầu tiên là ảnh đại diện.</span>
          ) : (
            <span>Thêm ảnh để khách dễ hình dung gói dịch vụ.</span>
          )}
        </p>
      </div>
    );
  }

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
        <div className="group relative h-[156px] overflow-hidden rounded-md border border-dashed border-primary bg-background">
          {previewUrl ? (
            <>
              <Image
                src={previewUrl}
                alt="Ảnh giấy tờ đã tải lên"
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(0)}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              className="flex size-full items-center justify-center text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50"
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

  const defaultGrid = (
    <div className="flex flex-wrap gap-3">
      {imageItems.map((item, index) => (
        <SortableImageItem
          key={item.id}
          id={item.id}
          index={index}
          sortable={reorderable}
          disabled={disabled || uploading || urls.length < 2}
        >
          {({ itemRef, handleRef, isDragging }) => (
            <div
              ref={itemRef}
              className={cn(
                'w-28 rounded-lg transition',
                isDragging && 'z-10 opacity-45 ring-2 ring-primary/40',
              )}
            >
              <Attachment orientation="vertical" state="done" className="w-full">
                <AttachmentMedia variant="image">
                  <Image
                    src={item.url}
                    alt={`Ảnh đã tải lên ${index + 1}`}
                  />
                  {reorderable && index === 0 ? (
                    <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                      Ảnh đại diện
                    </span>
                  ) : null}
                  {reorderable ? (
                    <SortableHandle
                      ref={handleRef}
                      label={`Kéo để sắp xếp ảnh ${index + 1}`}
                      disabled={disabled || uploading || urls.length < 2}
                      className="absolute right-1 top-1 z-10 rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                    />
                  ) : null}
                </AttachmentMedia>
                <AttachmentActions className="flex-wrap justify-end">
                  <AttachmentAction asChild aria-label="Xem ảnh">
                    <a href={item.url} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon />
                    </a>
                  </AttachmentAction>
                  <AttachmentAction
                    type="button"
                    onClick={() => removeAt(index)}
                    aria-label="Xoá ảnh"
                    disabled={disabled || uploading}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            </div>
          )}
        </SortableImageItem>
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
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-auto min-h-24 w-28 flex-col items-center justify-center gap-1 border-dashed text-muted-foreground"
        >
          <UploadIcon className="size-5" />
          <span className="text-xs">Tải ảnh lên</span>
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        multiple={multiple}
        hidden
        disabled={disabled || uploading}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {reorderable ? (
        <SortableCollection onMove={move} announcementLabel="Ảnh">
          {defaultGrid}
        </SortableCollection>
      ) : (
        defaultGrid
      )}
    </div>
  );
}

interface StableImageItem {
  id: string;
  url: string;
}

function useStableImageItems(urls: readonly string[]): StableImageItem[] {
  const idSeed = React.useId();
  const nextId = React.useRef(0);
  const previous = React.useRef<StableImageItem[]>([]);
  const used = new Set<string>();

  const items = urls.map((url) => {
    const existing = previous.current.find((item) => item.url === url && !used.has(item.id));
    const item = existing ?? { id: `${idSeed}-image-${nextId.current++}`, url };
    used.add(item.id);
    return item;
  });

  previous.current = items;
  return items;
}

function SortableImageItem({
  id,
  index,
  sortable,
  disabled,
  children,
}: {
  id: string;
  index: number;
  sortable: boolean;
  disabled?: boolean;
  children: (state: SortableItemState) => React.ReactNode;
}) {
  if (!sortable) {
    return children({
      itemRef: () => undefined,
      handleRef: () => undefined,
      isDragging: false,
      isDropTarget: false,
    });
  }

  return (
    <SortableItem id={id} index={index} disabled={disabled}>
      {children}
    </SortableItem>
  );
}

function GalleryAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full bg-background/90 text-foreground shadow-sm outline-none transition hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

const compactGalleryActionClassName =
  'pointer-events-auto grid size-11 place-items-center rounded-lg bg-scrim text-white shadow-sm outline-none backdrop-blur-sm transition hover:bg-scrim-strong focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4';

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
