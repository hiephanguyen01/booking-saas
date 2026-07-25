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

const standaloneHref = (typeId: string) => `/partner/listings/new?type=${typeId}&mode=standalone`;

/**
 * "Thêm tin đăng" trigger + modal that handles only the *selection* steps
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
    if (type.structure === 'standalone') return go(standaloneHref(type.id));
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
        <Button size="sm">
          <Plus className="size-4" aria-hidden /> Thêm tin đăng
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {flexibleType ? (
          <>
            <DialogHeader>
              <DialogTitle>Tạo {flexibleType.name}</DialogTitle>
              <DialogDescription>
                Chọn cấu trúc phù hợp với nội dung bạn muốn đăng.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                title="Một hạng mục"
                description="Tạo một lựa chọn có thể đặt độc lập."
                onClick={() => go(standaloneHref(flexibleType.id))}
              />
              <ChoiceCard
                title={`Nhiều ${flexibleType.itemLabel || 'hạng mục'}`}
                description="Một tin đăng chung chứa nhiều lựa chọn có thể đặt."
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
              <DialogTitle>Thêm tin đăng</DialogTitle>
              <DialogDescription>Chọn loại dịch vụ để bắt đầu.</DialogDescription>
            </DialogHeader>
            {listingTypes.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {listingTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => pickType(type)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border bg-background p-4 text-left transition-colors',
                      'hover:border-primary/60 hover:bg-muted',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                      <ListingTypeIcon
                        imageUrl={type.iconImageUrl}
                        name={type.icon}
                        className="size-5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{type.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {structureHint(type)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa có loại dịch vụ nào. Liên hệ quản trị viên để được cấu hình.
              </p>
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
        'rounded-lg border bg-background p-4 text-left transition-colors',
        'hover:border-primary/60 hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
