import { LISTING_TYPE_ICONS, type ListingTypeIcon } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import * as Icons from 'lucide-react';

/**
 * `listing_type.icon` is an icon NAME, not an upload. This used to be a `type:
 * 'file'` widget that produced an S3 publicUrl of ~80+ characters while the
 * contract capped `icon` at 60 — so saving an icon was IMPOSSIBLE in any
 * deployment. The contract, the unbounded-but-unset column, and the fact that no
 * surface ever rendered an <img> all say "name": a lucide key is theme-aware,
 * weightless, and re-tints with the tenant's palette. `LISTING_TYPE_ICONS` is the
 * shared allowlist — the same enum validates the write server-side.
 */
function IconGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon | undefined>)[name];
  return Icon ? <Icon className={className} aria-hidden /> : null;
}

/** Vietnamese labels — the picker's search text; keys mirror LISTING_TYPE_ICONS. */
const ICON_LABEL: Record<ListingTypeIcon, string> = {
  Camera: 'Máy ảnh',
  Aperture: 'Khẩu độ',
  Video: 'Quay phim',
  Clapperboard: 'Phim trường',
  Projector: 'Máy chiếu',
  Mic: 'Micro',
  Music: 'Âm nhạc',
  Speaker: 'Loa',
  Lightbulb: 'Đèn',
  Building2: 'Toà nhà',
  House: 'Nhà',
  Hotel: 'Khách sạn',
  BedDouble: 'Phòng ngủ',
  DoorOpen: 'Phòng',
  Warehouse: 'Kho xưởng',
  Store: 'Cửa hàng',
  Armchair: 'Ghế',
  Sofa: 'Sofa',
  Bath: 'Phòng tắm',
  Landmark: 'Địa danh',
  Car: 'Ô tô',
  Bike: 'Xe đạp',
  Ship: 'Tàu thuyền',
  Plane: 'Máy bay',
  Dumbbell: 'Phòng gym',
  Trophy: 'Thể thao',
  Waves: 'Bể bơi',
  HeartPulse: 'Sức khoẻ',
  Stethoscope: 'Y tế',
  Footprints: 'Sân bãi',
  Palette: 'Trang điểm',
  Scissors: 'Cắt tóc',
  Sparkles: 'Làm đẹp',
  Brush: 'Cọ trang điểm',
  Shirt: 'Thời trang',
  Flower2: 'Hoa',
  GraduationCap: 'Lớp học',
  BookOpen: 'Khoá học',
  Users: 'Nhóm',
  Drama: 'Biểu diễn',
  PartyPopper: 'Sự kiện',
  Cake: 'Tiệc',
  Utensils: 'Ăn uống',
  Coffee: 'Cà phê',
  Tent: 'Cắm trại',
  TreePine: 'Ngoài trời',
  MapPin: 'Địa điểm',
  Package: 'Thiết bị',
  Boxes: 'Kho',
  Wrench: 'Dụng cụ',
  Laptop: 'Máy tính',
  Monitor: 'Màn hình',
  Gamepad2: 'Trò chơi',
  Baby: 'Trẻ em',
  Dog: 'Thú cưng',
  CalendarDays: 'Lịch',
  Clock: 'Giờ',
  Tag: 'Nhãn',
};

/** Radiogroup of allowlisted lucide icons; re-clicking the selection clears it (optional field). */
export function IconPicker({
  value,
  onChange,
  error,
}: {
  value: string | undefined;
  onChange: (value: ListingTypeIcon | undefined) => void;
  error?: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Biểu tượng (tuỳ chọn)</h2>
        <p className="text-xs text-muted-foreground">
          Hiển thị cạnh tên loại dịch vụ trên storefront.
        </p>
      </div>
      <div role="radiogroup" aria-label="Biểu tượng" className="flex flex-wrap gap-2">
        {LISTING_TYPE_ICONS.map((name) => {
          const selected = value === name;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={ICON_LABEL[name]}
              title={ICON_LABEL[name]}
              // Re-clicking the selected icon clears it — `icon` is optional.
              onClick={() => onChange(selected ? undefined : name)}
              className={cn(
                'flex size-11 items-center justify-center rounded-md border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <IconGlyph name={name} className="size-5" />
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
