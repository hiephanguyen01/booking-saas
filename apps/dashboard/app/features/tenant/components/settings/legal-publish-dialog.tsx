import { useState } from 'react';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Send } from 'lucide-react';

type Classification = 'minor' | 'material';

/**
 * Forces the tenant to classify a publish before it happens (Task 14 step 4):
 * a typo fix creates a new version that nobody has to re-accept, a terms
 * change creates a new version AND resets every partner/affiliate's
 * acceptance — the API decides who is blocked based on `material`.
 */
export function LegalPublishDialog({
  docLabel,
  disabled,
  busy,
  onConfirm,
}: {
  docLabel: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: (material: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [classification, setClassification] = useState<Classification>('material');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled}>
          <Send className="size-3.5" /> Công bố
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Công bố {docLabel}</DialogTitle>
          <DialogDescription>
            Bản nháp hiện tại sẽ trở thành phiên bản công khai mới. Chọn đúng loại thay đổi — lựa
            chọn này quyết định ai phải đồng ý lại.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={classification}
          onValueChange={(value) => setClassification(value as Classification)}
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="minor" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Sửa lỗi chính tả / trình bày</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Tạo phiên bản mới. Đối tác và cộng tác viên đã đồng ý bản trước đó không phải đồng ý
                lại.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="material" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Thay đổi điều khoản</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Tạo phiên bản mới và buộc mọi đối tác, cộng tác viên đồng ý lại trước khi tiếp tục
                thao tác trên hệ thống.
              </span>
            </span>
          </label>
        </RadioGroup>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              onConfirm(classification === 'material');
              setOpen(false);
            }}
          >
            {busy ? 'Đang công bố...' : 'Xác nhận công bố'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
