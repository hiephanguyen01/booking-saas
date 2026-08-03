import { useState, type FormEvent } from 'react';
import { useFetcher, useNavigation, useSubmit } from 'react-router';
import type { OwnerBalanceResponse, TenantPayableResponse } from '@booking/contracts';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
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
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Banknote, CircleAlert, Plus } from 'lucide-react';
import { PAYOUT_INELIGIBLE_REASON } from '~/constants/finance';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { formatVnd } from '~/lib/format';
import { Money } from '~/components/money';
import { PAYEE_TYPE_LABEL } from '~/constants/finance';

/**
 * The slice of the finance route's loader data the payable preview reads.
 * Declared structurally (not `useFetcher<typeof loader>`) so this component
 * never imports from `routes/**` — BOTH loader branches return these two keys.
 */
interface PayablePreviewData {
  payable: TenantPayableResponse | null;
  payableError: string | null;
}

/** Opens the create-payout form; previews the payee's TRUE payable before submit. */
export function CreatePayoutDialog({
  partnerPayees,
  affiliatePayees,
  partnerNames,
  readOnly,
}: {
  partnerPayees: OwnerBalanceResponse[];
  affiliatePayees: OwnerBalanceResponse[];
  partnerNames: Record<string, string>;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [payeeType, setPayeeType] = useState<'partner' | 'affiliate'>('partner');
  const [payeeId, setPayeeId] = useState('');
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  // Loads GET /tenant/finance?payeeType&payeeId (the finance route's loader) → the payee's TRUE payable.
  const preview = useFetcher<PayablePreviewData>();
  const payable = preview.data?.payable ?? null;
  const payableError = preview.data?.payableError ?? null;
  const loadingPayable = preview.state !== 'idle';

  const payees = payeeType === 'partner' ? partnerPayees : affiliatePayees;
  const nameOf = (id: string): string =>
    payeeType === 'partner' ? partnerNames[id] ?? id.slice(0, 8) : id.slice(0, 8);

  const loadPayable = (type: 'partner' | 'affiliate', id: string): void => {
    if (id) void preview.load(`/tenant/finance?payeeType=${type}&payeeId=${encodeURIComponent(id)}`);
  };
  const onTypeChange = (v: 'partner' | 'affiliate'): void => {
    setPayeeType(v);
    setPayeeId('');
  };
  const onPayeeChange = (id: string): void => {
    setPayeeId(id);
    loadPayable(payeeType, id);
  };

  // The number the run will actually pay is `available`; only an eligible payee can be paid.
  const showPreview = payeeId !== '' && payable !== null && payable.payeeId === payeeId;
  const eligible = showPreview && payable.eligible;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => {
      submit(formData, { method: 'post' });
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={readOnly || busy}>
          <Plus className="size-4" /> Tạo lệnh chi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} aria-busy={busy}>
          <input type="hidden" name="intent" value="create-payout" />
          <input type="hidden" name="payeeType" value={payeeType} />
          <DialogHeader>
            <DialogTitle>Tạo lệnh chi</DialogTitle>
            <DialogDescription>
              Chi số dư đã qua thời gian giữ của bên nhận — đây là số tiền lệnh chi thực trả.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Loại người nhận</Label>
              <Select
                value={payeeType}
                onValueChange={(v) => onTypeChange(v as 'partner' | 'affiliate')}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">{PAYEE_TYPE_LABEL.partner}</SelectItem>
                  <SelectItem value="affiliate">{PAYEE_TYPE_LABEL.affiliate}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payeeId">Người nhận</Label>
              <Select
                name="payeeId"
                required
                value={payeeId}
                onValueChange={onPayeeChange}
                key={payeeType}
                disabled={busy}
              >
                <SelectTrigger id="payeeId">
                  <SelectValue placeholder="Chọn người nhận…" />
                </SelectTrigger>
                <SelectContent>
                  {payees.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Không có số dư phải chi
                    </SelectItem>
                  ) : (
                    payees.map((b) => (
                      <SelectItem key={b.ownerId} value={b.ownerId as string}>
                        {nameOf(b.ownerId as string)} · số dư {formatVnd(b.balance)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {payeeId !== '' ? (
              <PayablePreview
                loading={loadingPayable}
                error={payableError}
                payable={showPreview ? payable : null}
              />
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || loadingPayable || !eligible}>
              <Banknote className="size-4" /> Tạo lệnh chi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The TRUE payable for the selected payee: the headline `available` plus every input that shaped it. */
function PayablePreview({
  loading,
  error,
  payable,
}: {
  loading: boolean;
  error: string | null;
  payable: TenantPayableResponse | null;
}) {
  if (loading) {
    return (
      <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        Đang tính số tiền phải chi…
      </p>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!payable) return null;

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Lệnh chi sẽ trả</span>
        <Money value={payable.available} className="text-lg font-semibold" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <dt>Số dư sổ cái</dt>
        <dd className="text-right">
          <Money value={payable.balance} />
        </dd>
        <dt>Đã qua thời gian giữ</dt>
        <dd className="text-right">
          <Money value={payable.maturePayable} />
        </dd>
        <dt>Đang trong lệnh chi khác</dt>
        <dd className="text-right">
          −<Money value={payable.outstanding} />
        </dd>
        <dt>Thời gian giữ</dt>
        <dd className="text-right tabular-nums">{payable.holdingDays} ngày</dd>
        <dt>Mức tối thiểu / kỳ</dt>
        <dd className="text-right">
          <Money value={payable.minAmount} />
        </dd>
      </dl>
      {!payable.eligible && payable.ineligibleReason ? (
        <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          {PAYOUT_INELIGIBLE_REASON[payable.ineligibleReason]}
        </p>
      ) : null}
    </div>
  );
}
