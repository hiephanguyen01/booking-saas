import type { CreateCancellationPolicyInput } from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Plus, X } from 'lucide-react';

type TierKey = 'hoursBefore' | 'refundPercent';

/** Repeatable refund-tier editor shared by partner and tenant policy forms. */
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
        const update = (
          i: number,
          patch: Partial<{ hoursBefore: number; refundPercent: number }>,
        ) => field.onChange(rows.map((row, index) => (index === i ? { ...row, ...patch } : row)));
        const remove = (i: number) => field.onChange(rows.filter((_, index) => index !== i));
        const add = () => field.onChange([...rows, { hoursBefore: 0, refundPercent: 0 }]);

        return (
          <div className="space-y-3">
            {rootMessage ? <p className="text-xs text-destructive">{String(rootMessage)}</p> : null}
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label>Huỷ trước</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        value={row.hoursBefore}
                        onChange={(event) =>
                          update(index, { hoursBefore: Number(event.target.value) })
                        }
                        aria-invalid={rowError(index, 'hoursBefore') ? true : undefined}
                        className="pr-12 tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        giờ
                      </span>
                    </div>
                    {rowError(index, 'hoursBefore') ? (
                      <p className="text-xs text-destructive">{rowError(index, 'hoursBefore')}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tỷ lệ hoàn</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={row.refundPercent}
                        onChange={(event) =>
                          update(index, { refundPercent: Number(event.target.value) })
                        }
                        aria-invalid={rowError(index, 'refundPercent') ? true : undefined}
                        className="pr-10 tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                    {rowError(index, 'refundPercent') ? (
                      <p className="text-xs text-destructive">{rowError(index, 'refundPercent')}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    aria-label={`Xoá mốc hoàn tiền ${index + 1}`}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="size-4" /> Thêm mốc
            </Button>
          </div>
        );
      }}
    />
  );
}
