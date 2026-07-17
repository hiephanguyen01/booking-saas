import { useState } from 'react';
import { Form } from 'react-router';
import type { PayoutResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { formatVnd } from '~/lib/format';
import { useBusy } from '~/hooks/use-busy';

/**
 * Manual settlement dialogs for a pending/processing payout. Both submit to the
 * finance route's action (`intent` = mark-paid | mark-failed).
 */
export function MarkPaidDialog({
  payout,
  name,
  readOnly,
}: {
  payout: PayoutResponse;
  name: string;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const busy = useBusy();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={readOnly}>Đánh dấu đã chi</Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="mark-paid" />
          <input type="hidden" name="payoutId" value={payout.id} />
          <DialogHeader>
            <DialogTitle>Xác nhận đã chi trả</DialogTitle>
            <DialogDescription>
              {name} · {formatVnd(payout.amount)}. Nhập chứng từ chuyển khoản.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`ref-${payout.id}`}>Số tham chiếu chuyển khoản</Label>
              <Input id={`ref-${payout.id}`} name="reference" required maxLength={200} placeholder="VD: FT24123456789" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ev-${payout.id}`}>Mã chứng từ (tuỳ chọn)</Label>
              <Input id={`ev-${payout.id}`} name="evidenceKey" maxLength={500} placeholder="Khoá tệp bằng chứng đã tải lên" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="ghost">Huỷ</Button></DialogClose>
            <Button type="submit" disabled={busy}>Xác nhận đã chi</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function MarkFailedDialog({
  payout,
  name,
  readOnly,
}: {
  payout: PayoutResponse;
  name: string;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const busy = useBusy();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={readOnly}>
          Đánh dấu thất bại
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="mark-failed" />
          <input type="hidden" name="payoutId" value={payout.id} />
          <DialogHeader>
            <DialogTitle>Đánh dấu lệnh chi thất bại</DialogTitle>
            <DialogDescription>
              {name} · {formatVnd(payout.amount)}. Công nợ sẽ được đưa lại vào chu kỳ chi trả kế tiếp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor={`fail-${payout.id}`}>Lý do (tuỳ chọn)</Label>
            <Input id={`fail-${payout.id}`} name="reason" maxLength={500} placeholder="VD: sai số tài khoản" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="ghost">Huỷ</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={busy}>Xác nhận thất bại</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
