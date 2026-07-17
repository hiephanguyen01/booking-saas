import {
  createBlockExceptionInputSchema,
  type CreateBlockExceptionInput,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { parseDay } from '~/lib/calendar-dates';

/** The subset of a partner listing the quick-block dialog needs. */
export interface BlockableListing {
  id: string;
  title: string;
  resourceId: string;
}

/** Marks one day closed for one resource; open while `day` is non-null. */
export function QuickBlockDialog({
  day,
  listings,
  serverError,
  fieldErrors,
  onOpenChange,
}: {
  day: string | null;
  listings: BlockableListing[];
  serverError: string | null;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Note: the select stores a *listing* id; the route action maps it to the
  // listing's real resource id before submitting the block.
  const fields: FieldConfig<CreateBlockExceptionInput>[] = [
    {
      name: 'listingId',
      type: 'select',
      label: 'Tài nguyên',
      placeholder: 'Chọn tài nguyên',
      options: listings.map((l) => ({ value: l.id, label: l.title })),
    },
    { name: 'date', type: 'date', label: 'Ngày', placeholder: 'Chọn ngày' },
    {
      name: 'reason',
      type: 'textarea',
      label: 'Lý do (tuỳ chọn)',
      placeholder: 'Bảo trì, nghỉ lễ…',
      rows: 2,
    },
  ];

  return (
    <Dialog open={day !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chặn lịch</DialogTitle>
          <DialogDescription>
            Đánh dấu một ngày là đóng cho một tài nguyên. Ngày bị chặn sẽ không còn hiển thị để
            khách đặt.
          </DialogDescription>
        </DialogHeader>
        <GenericForm
          key={day ?? 'closed'}
          schema={createBlockExceptionInputSchema}
          fields={fields}
          submitLabel="Chặn ngày này"
          serverError={serverError}
          fieldErrors={fieldErrors}
          defaultValues={{
            listingId: listings[0]?.id ?? '',
            date: day ? parseDay(day) : undefined,
          }}
        >
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
        </GenericForm>
      </DialogContent>
    </Dialog>
  );
}
