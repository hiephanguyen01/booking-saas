import { updatePlanInputSchema, type PlanResponse } from '@booking/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { planEditFields } from './plan-form-fields';

/**
 * "Sửa gói" dialog. Open while `editing` is set; the form injects the plan `id`
 * into the JSON submission so the route action discriminates update from create.
 */
export function EditPlanDialog({
  editing,
  onClose,
  error,
  fieldErrors,
}: {
  editing: PlanResponse | null;
  onClose: () => void;
  error: string | null;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sửa gói{editing ? ` “${editing.name}”` : ''}</DialogTitle>
          <DialogDescription>
            Cập nhật giá và hạn mức. Đổi giá một gói đang có người đăng ký cần bật “áp giá mới”.
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <GenericForm
            key={editing.id}
            schema={updatePlanInputSchema}
            fields={planEditFields}
            method="patch"
            submitLabel="Lưu thay đổi"
            serverError={error}
            fieldErrors={fieldErrors}
            transform={(v) => ({ ...v, id: editing.id })}
            defaultValues={{
              name: editing.name,
              priceMonthly: editing.priceMonthly,
              limits: { ...editing.limits },
              isActive: editing.isActive,
              repriceExistingSubscribers: false,
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
