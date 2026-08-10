import type { ThemeConfigInput } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { Image as UiImage } from '@booking/ui/components/media/image';
import { presignAndPut } from '@booking/ui/lib/upload';
import { ImagePlus, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

const MAIN_ICON_SIZES = [180, 192, 512] as const;
const ACCEPTED_TYPES = new Set(['image/png', 'image/webp']);

export function PwaIconUploader({ form }: { form: UseFormReturn<ThemeConfigInput> }) {
  const icons = useWatch({ control: form.control, name: 'pwaIcons' });
  const { register } = form;
  const mainInput = useRef<HTMLInputElement>(null);
  const maskableInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'main' | 'maskable' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    register('pwaIcons');
  }, [register]);

  async function uploadMain(file: File | undefined) {
    if (!file) return;
    setBusy('main');
    setError(null);
    try {
      const source = await readSquareImage(file);
      const variants = await Promise.all(
        MAIN_ICON_SIZES.map(async (size) => ({
          size,
          file: await renderPng(source, size, iconFilename(file.name, size)),
        })),
      );
      const uploaded = await Promise.all(
        variants.map(({ file: variant }) => presignAndPut(variant, { target: 'tenants' })),
      );
      form.setValue(
        'pwaIcons',
        {
          icon180Url: uploaded[0].publicUrl,
          icon192Url: uploaded[1].publicUrl,
          icon512Url: uploaded[2].publicUrl,
          ...(icons?.maskable512Url ? { maskable512Url: icons.maskable512Url } : {}),
        },
        { shouldDirty: true, shouldValidate: true },
      );
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      sourceInputReset(mainInput.current);
      setBusy(null);
    }
  }

  async function uploadMaskable(file: File | undefined) {
    if (!file) return;
    if (!icons) {
      setError('Hãy tải icon chính trước khi thêm icon maskable.');
      sourceInputReset(maskableInput.current);
      return;
    }
    setBusy('maskable');
    setError(null);
    try {
      const source = await readSquareImage(file);
      const variant = await renderPng(source, 512, iconFilename(file.name, 512, 'maskable'));
      const uploaded = await presignAndPut(variant, { target: 'tenants' });
      form.setValue(
        'pwaIcons',
        { ...icons, maskable512Url: uploaded.publicUrl },
        { shouldDirty: true, shouldValidate: true },
      );
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      sourceInputReset(maskableInput.current);
      setBusy(null);
    }
  }

  function clearAll() {
    form.setValue('pwaIcons', undefined, { shouldDirty: true, shouldValidate: true });
    setError(null);
  }

  function clearMaskable() {
    if (!icons) return;
    const requiredIcons = {
      icon180Url: icons.icon180Url,
      icon192Url: icons.icon192Url,
      icon512Url: icons.icon512Url,
    };
    form.setValue('pwaIcons', requiredIcons, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="space-y-5">
      <input
        ref={mainInput}
        type="file"
        accept="image/png,image/webp"
        className="sr-only"
        onChange={(event) => void uploadMain(event.target.files?.[0])}
      />
      <input
        ref={maskableInput}
        type="file"
        accept="image/png,image/webp"
        className="sr-only"
        onChange={(event) => void uploadMaskable(event.target.files?.[0])}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
        <IconPreview src={icons?.icon512Url} alt="Icon ứng dụng chính" />
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Icon chính</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              PNG/WebP vuông, tối thiểu 512×512px. Trình duyệt sẽ tạo và tải song song các bản PNG
              180, 192 và 512px; biểu mẫu chỉ đổi khi cả ba hoàn tất.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => mainInput.current?.click()}
              disabled={busy !== null}
            >
              {busy === 'main' ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              {icons ? 'Thay icon chính' : 'Tải icon chính'}
            </Button>
            {icons ? (
              <Button type="button" variant="ghost" onClick={clearAll} disabled={busy !== null}>
                <Trash2 /> Xóa bộ icon
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t pt-5">
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
          <SafeZonePreview src={icons?.maskable512Url} />
          <div className="space-y-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4" /> Icon maskable 512 (tùy chọn)
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Tải riêng PNG/WebP vuông ≥512px. Giữ logo và chữ quan trọng bên trong vòng tròn nét
                đứt để Android không cắt mất khi áp dụng hình dạng icon.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => maskableInput.current?.click()}
                disabled={busy !== null || !icons}
              >
                {busy === 'maskable' ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                {icons?.maskable512Url ? 'Thay icon maskable' : 'Tải icon maskable'}
              </Button>
              {icons?.maskable512Url ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearMaskable}
                  disabled={busy !== null}
                >
                  <Trash2 /> Xóa maskable
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconPreview({ src, alt }: { src?: string; alt: string }) {
  return (
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-muted/40">
      {src ? (
        <UiImage src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

function SafeZonePreview({ src }: { src?: string }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted/40">
      {src ? (
        <UiImage src={src} alt="Icon maskable với vùng an toàn" className="size-full object-cover" />
      ) : (
        <ShieldCheck
          className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <div
        className="pointer-events-none absolute inset-[10%] rounded-full border-2 border-dashed border-white/90 shadow-[0_0_0_999px_rgb(15_23_42/0.15)]"
        aria-hidden="true"
      />
    </div>
  );
}

async function readSquareImage(file: File): Promise<HTMLImageElement> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Chỉ chấp nhận tệp PNG hoặc WebP.');
  if (typeof document === 'undefined') throw new Error('Trình duyệt này không hỗ trợ xử lý ảnh.');
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth !== image.naturalHeight || image.naturalWidth < 512) {
      throw new Error('Ảnh phải vuông và có kích thước tối thiểu 512×512px.');
    }
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderPng(source: HTMLImageElement, size: number, filename: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt này không hỗ trợ Canvas để tạo icon.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Không thể tạo phiên bản PNG từ ảnh đã chọn.');
  return new File([blob], filename, { type: 'image/png' });
}

function iconFilename(original: string, size: number, suffix?: string): string {
  const stem = original.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `${stem || 'pwa-icon'}-${suffix ? `${suffix}-` : ''}${size}.png`;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Không thể tải icon lên. Vui lòng thử lại.';
}

function sourceInputReset(input: HTMLInputElement | null) {
  if (input) input.value = '';
}
