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
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { dashboardPaths } from '~/constants/paths';
import { ListingStructureChoices, ListingTypeChoiceList } from './listing-type-choices';

/** Where picking a type leads, for the types that need no second step. */
function destinationFor(type: ListingTypeResponse): string {
  if (type.structure === 'grouped') return dashboardPaths.partner.newListingGroup(type.id);
  return dashboardPaths.partner.listingNew(type.id, 'standalone');
}

/**
 * "Tạo bài đăng" trigger + modal that handles only the *selection* steps
 * (pick a listing type, and for `flexible` types pick single vs. multi-item),
 * then navigates straight to the appropriate create-form page with the type
 * (and mode) pre-set. This replaces the old intermediate type-picker/mode
 * pages so the partner no longer hops through blank pages to reach the form.
 */
export function CreateListingDialog({ listingTypes }: { listingTypes: ListingTypeResponse[] }) {
  const [open, setOpen] = useState(false);
  const [flexibleType, setFlexibleType] = useState<ListingTypeResponse | null>(null);

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
            <ListingStructureChoices type={flexibleType} onSelect={() => setOpen(false)} />
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
            <ListingTypeChoiceList
              listingTypes={listingTypes}
              hrefFor={destinationFor}
              onSelect={(type, event) => {
                // A flexible type needs the structure step first — stay in the dialog.
                if (type.structure === 'flexible') {
                  event.preventDefault();
                  setFlexibleType(type);
                  return;
                }
                setOpen(false);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
