import type { ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { cn } from '@booking/ui/lib/utils';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ListingTypeIcon } from '~/components/listing-type-icon';
import { dashboardPaths } from '~/constants/paths';

/** One-line description of what a listing type produces — mirrors new.tsx copy. */
function structureHint(type: ListingTypeResponse): string {
  if (type.structure === 'grouped') {
    return `Một tin đăng chứa nhiều ${type.itemLabel || 'hạng mục'}.`;
  }
  if (type.structure === 'flexible') return 'Có thể tạo độc lập hoặc theo nhóm.';
  return 'Một hạng mục độc lập.';
}

/**
 * "Tạo bài đăng" trigger + modal that handles only the *selection* steps
 * (pick a listing type, and for `flexible` types pick single vs. multi-item),
 * then navigates straight to the appropriate create-form page with the type
 * (and mode) pre-set. This replaces the old intermediate type-picker/mode
 * pages so the partner no longer hops through blank pages to reach the form.
 */
export function CreateListingDialog({ listingTypes }: { listingTypes: ListingTypeResponse[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [flexibleType, setFlexibleType] = useState<ListingTypeResponse | null>(null);

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  function pickType(type: ListingTypeResponse) {
    if (type.structure === 'standalone')
      return go(dashboardPaths.partner.listingNew(type.id, 'standalone'));
    if (type.structure === 'grouped') return go(dashboardPaths.partner.newListingGroup(type.id));
    setFlexibleType(type); // flexible → choose structure in step 2
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFlexibleType(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="control">
          <Plus className="size-4" aria-hidden /> Tạo bài đăng
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[43rem]">
        {flexibleType ? (
          <>
            <DialogHeader>
              <DialogTitle>Tạo {flexibleType.name}</DialogTitle>
              <DialogDescription>
                Chọn cấu trúc phù hợp với nội dung bạn muốn đăng.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceCard
                title={`Một ${flexibleType.itemLabel || 'hạng mục'} độc lập`}
                description="Khách mở và đặt trực tiếp một lựa chọn duy nhất."
                onClick={() => go(dashboardPaths.partner.listingNew(flexibleType.id, 'standalone'))}
              />
              <ChoiceCard
                title={`Tin đăng nhiều ${flexibleType.itemLabel || 'hạng mục'}`}
                description="Tạo thông tin chung trước, sau đó thêm giá và lịch cho từng lựa chọn."
                onClick={() => go(dashboardPaths.partner.newListingGroup(flexibleType.id))}
              />
            </div>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setFlexibleType(null)}>
                <ArrowLeft className="size-4" aria-hidden /> Quay lại
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Tạo bài đăng</DialogTitle>
              <DialogDescription>
                Chọn loại dịch vụ. BookingOS sẽ mở đúng biểu mẫu và cách tính giá tương ứng.
              </DialogDescription>
            </DialogHeader>
            {listingTypes.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {listingTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => pickType(type)}
                    className={cn(
                      'flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors',
                      'hover:border-primary/40 hover:bg-muted/20',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    )}
                  >
                    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-primary">
                      <ListingTypeIcon
                        imageUrl={type.iconImageUrl}
                        name={type.icon}
                        className="size-8"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{type.name}</span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {structureHint(type)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground/70"
                      aria-hidden
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                Chưa có loại dịch vụ nào. Liên hệ quản trị viên để được cấu hình.
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-28 rounded-2xl border bg-card p-5 text-left transition-colors',
        'hover:border-primary/40 hover:bg-muted/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
