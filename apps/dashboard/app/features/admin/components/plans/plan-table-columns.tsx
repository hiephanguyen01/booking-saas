import type { FormEvent } from 'react';
import { Form } from 'react-router';
import { Check, Minus, Pencil, Trash2 } from 'lucide-react';
import type { PlanResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { formatNumber } from '~/lib/format';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';

const Bool = ({ on }: { on: boolean }) =>
  on ? (
    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Có" />
  ) : (
    <Minus className="size-4 text-muted-foreground" aria-label="Không" />
  );

/**
 * Plans table columns. `onEdit` opens the edit dialog for a row (the route owns
 * the `editing` state); delete keeps its inline confirm dialog and submits the
 * existing `intent=delete` FormData through the route-owned guarded handler.
 */
export function buildPlanColumns({
  onEdit,
  onDelete,
  busy,
}: {
  onEdit: (plan: PlanResponse) => void;
  onDelete: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}): DataTableColumn<PlanResponse>[] {
  return [
    {
      header: 'Gói',
      cell: (p) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{p.name}</span>
          {!p.isActive ? <span className="text-xs text-muted-foreground">Đã tắt</span> : null}
        </div>
      ),
    },
    {
      header: 'Giá / tháng',
      headClassName: 'text-right',
      className: 'text-right font-medium',
      cell: (p) => <Money value={p.priceMonthly} />,
    },
    {
      header: 'Người đăng ký',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (p) => formatNumber(p.subscriberCount),
    },
    {
      header: 'MRR',
      headClassName: 'text-right',
      className: 'text-right font-medium',
      cell: (p) => <Money value={p.mrr} />,
    },
    {
      header: 'Partner',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (p) => formatNumber(p.limits.maxPartners),
    },
    {
      header: 'Tin đăng',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (p) => formatNumber(p.limits.maxListings),
    },
    {
      header: 'Booking / tháng',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (p) => formatNumber(p.limits.maxBookingsPerMonth),
    },
    {
      header: 'Tên miền riêng',
      headClassName: 'text-center',
      className: 'text-center',
      cell: (p) => (
        <div className="flex justify-center">
          <Bool on={p.limits.customDomain} />
        </div>
      ),
    },
    {
      header: 'Cộng tác viên',
      headClassName: 'text-center',
      className: 'text-center',
      cell: (p) => (
        <div className="flex justify-center">
          <Bool on={p.limits.affiliateModule} />
        </div>
      ),
    },
    {
      header: 'Cập nhật',
      cell: (p) => <DateTimeValue iso={p.updatedAt} className="text-sm text-muted-foreground" />,
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Sửa gói ${p.name}`}
            onClick={() => onEdit(p)}
            disabled={busy}
          >
            <Pencil className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Xoá gói ${p.name}`}
                className="text-destructive hover:text-destructive"
                disabled={busy}
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent aria-busy={busy}>
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá gói “{p.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Chỉ xoá được gói chưa từng có người đăng ký. Nếu gói đã bán, hãy tắt gói thay vì
                  xoá. Thao tác này không thể hoàn tác.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Huỷ</AlertDialogCancel>
                <Form method="post" onSubmit={onDelete}>
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={p.id} />
                  <AlertDialogAction type="submit" variant="destructive" disabled={busy}>
                    {busy ? 'Đang xoá…' : 'Xoá gói'}
                  </AlertDialogAction>
                </Form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];
}
