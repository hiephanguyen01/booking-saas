import type { ThemeConfigInput } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import { ExternalLink, ImageIcon, Monitor } from 'lucide-react';

export function StorefrontThemePreview({
  tenantName,
  value,
  storefrontUrl,
}: {
  tenantName: string;
  value: ThemeConfigInput;
  storefrontUrl: string | null;
}) {
  const primary = safeColor(value.colors?.primary, '#1f2937');
  const accent = safeColor(value.colors?.accent, '#d97706');
  const background = safeColor(value.colors?.background, '#ffffff');
  const heroImage = value.hero?.imageUrl || null;

  return (
    <aside className="space-y-3 xl:sticky xl:top-20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Monitor className="size-4 text-primary" aria-hidden="true" />
            Xem trước storefront
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Cập nhật theo dữ liệu đang nhập.</p>
        </div>
        {storefrontUrl ? (
          <Button asChild size="xs" variant="ghost">
            <a href={storefrontUrl} target="_blank" rel="noreferrer">
              Mở trang thật <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-muted/30 shadow-sm">
        <div className="flex h-8 items-center gap-1.5 border-b bg-muted/70 px-3" aria-hidden="true">
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="ml-2 h-3.5 flex-1 rounded-sm bg-background/75" />
        </div>
        <div style={{ backgroundColor: background, color: readableText(background) }}>
          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {value.logoUrl ? (
                <Image
                  src={value.logoUrl}
                  alt={`Logo ${tenantName}`}
                  className="size-7 rounded-md object-contain"
                />
              ) : (
                <span
                  className="flex size-7 items-center justify-center rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: primary }}
                >
                  {tenantName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate text-xs font-semibold">{tenantName}</span>
            </div>
            <span className="text-[10px] opacity-60">Dịch vụ&nbsp;&nbsp; Liên hệ</span>
          </div>

          <div className="relative min-h-52 overflow-hidden">
            {heroImage ? (
              <Image
                src={heroImage}
                alt="Ảnh hero đang xem trước"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-black/[0.035]">
                <ImageIcon className="size-8 opacity-20" aria-hidden="true" />
              </div>
            )}
            {heroImage ? <div className="absolute inset-0 bg-black/45" /> : null}
            <div
              className={`relative flex min-h-52 flex-col justify-end p-5 ${heroImage ? 'text-white' : ''}`}
            >
              <p className="max-w-[16rem] text-xl font-semibold leading-tight tracking-tight">
                {value.hero?.title || 'Tiêu đề trang đặt chỗ'}
              </p>
              <p
                className={`mt-2 max-w-[18rem] text-[11px] leading-4 ${heroImage ? 'text-white/80' : 'opacity-60'}`}
              >
                {value.hero?.subtitle || 'Mô tả ngắn giúp khách hiểu dịch vụ và bắt đầu đặt chỗ.'}
              </p>
              <span
                className="mt-4 inline-flex w-fit rounded-md px-3 py-1.5 text-[10px] font-semibold text-white"
                style={{ backgroundColor: primary }}
              >
                Xem lịch trống
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[1.2fr_0.8fr] gap-3 p-4">
            <div className="rounded-lg border border-black/10 p-3">
              <p className="text-[10px] font-semibold">Dịch vụ nổi bật</p>
              <div className="mt-2 h-12 rounded-md bg-black/[0.055]" />
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: `${accent}1a` }}>
              <p className="text-[10px] font-semibold">Đặt chỗ nhanh</p>
              <p className="mt-2 text-[9px] leading-3 opacity-60">
                Chọn ngày và khung giờ phù hợp.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Preview mô phỏng nhận diện chính. Hãy mở storefront thật để kiểm tra toàn bộ nội dung và
        responsive trước khi công bố.
      </p>
    </aside>
  );
}

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim();
  return fallback;
}

function readableText(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return '#111827';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 170 ? '#111827' : '#f9fafb';
}
