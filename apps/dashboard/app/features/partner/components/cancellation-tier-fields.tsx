import type { CreateCancellationPolicyInput } from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Plus, X } from 'lucide-react';

type TierKey = 'hoursBefore' | 'refundPercent';

/**
 * Repeatable refund-tier editor for a cancellation policy, bound to the shared
 * react-hook-form instance via `Controller` (mirrors the listing-type attribute
 * editor). Rows are stored unsorted; the display layer sorts by `hoursBefore`.
 */
export function CancellationTierFields({
  form,
}: {
  form: UseFormReturn<CreateCancellationPolicyInput>;
}) {
  const errors = form.formState.errors;
  const rootMessage = errors.rules?.message ?? errors.rules?.root?.message;
  const rowError = (i: number, key: TierKey): string | undefined =>
    errors.rules?.[i]?.[key]?.message;

  return (
    <Controller
      control={form.control}
      name="rules"
      render={({ field }) => {
        const rows = field.value ?? [];
        const update = (i: number, patch: Partial<{ hoursBefore: number; refundPercent: number }>) =>
          field.onChange(rows.map((r, index) => (index === i ? { ...r, ...patch } : r)));
        const remove = (i: number) => field.onChange(rows.filter((_, index) => index !== i));
        const add = () => field.onChange([...rows, { hoursBefore: 0, refundPercent: 0 }]);

        return (
          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="text-sm font-semibold">Mốc hoàn tiền</h2>
              <p className="text-xs text-muted-foreground">
                Huỷ trước bao nhiêu giờ thì được hoàn bao nhiêu phần trăm. Ví dụ: huỷ trước 48 giờ hoàn
                50%. Khi hiển thị, các mốc được sắp theo số giờ giảm dần.
              </p>
            </div>
            {rootMessage ? <p className="text-xs text-destructive">{String(rootMessage)}</p> : null}
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Huỷ trước (giờ)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={r.hoursBefore}
                      onChange={(e) => update(i, { hoursBefore: Number(e.target.value) })}
                      aria-invalid={rowError(i, 'hoursBefore') ? true : undefined}
                    />
                    {rowError(i, 'hoursBefore') ? (
                      <p className="text-xs text-destructive">{rowError(i, 'hoursBefore')}</p>
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label>Hoàn (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={r.refundPercent}
                      onChange={(e) => update(i, { refundPercent: Number(e.target.value) })}
                      aria-invalid={rowError(i, 'refundPercent') ? true : undefined}
                    />
                    {rowError(i, 'refundPercent') ? (
                      <p className="text-xs text-destructive">{rowError(i, 'refundPercent')}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(i)}
                    aria-label="Xoá mốc"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="size-4" /> Thêm mốc
            </Button>
          </section>
        );
      }}
    />
  );
}
