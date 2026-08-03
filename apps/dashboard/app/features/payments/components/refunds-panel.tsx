import type { FormEvent } from 'react';
import type { RefundHistoryItem } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ArrowUpRight, CircleAlert, Wallet } from 'lucide-react';
import { Form, Link, useNavigation, useSubmit } from 'react-router';
import { dashboardPaths } from '~/constants/paths';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { formatDateTime, formatVnd } from '~/lib/format';
import { REFUND_STATUS_LABEL } from '~/constants/payments';

/** A gateway refund id means the provider (MoMo) pushed the money back automatically. */
function isAuto(refund: RefundHistoryItem): boolean {
  return !!refund.gatewayRefundId;
}

function sumSucceeded(refunds: RefundHistoryItem[]): string {
  return refunds
    .filter((r) => r.status === 'succeeded')
    .reduce((acc, r) => acc + BigInt(r.amount), 0n)
    .toString();
}

export function RefundsPanel({
  refunds,
  canManage,
  error,
}: {
  refunds: RefundHistoryItem[];
  canManage: boolean;
  error: string | null;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  if (!error && refunds.length === 0) return null;

  const inProgress = refunds.filter(
    (r) => r.status === 'pending' || r.status === 'manual_required',
  ).length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <CardTitle>Hoàn tiền khách hàng</CardTitle>
        <p className="text-sm text-muted-foreground">
          MoMo và giao dịch thẻ đủ điều kiện được hoàn tự động về khách khi huỷ đơn. Các khoản còn lại
          (SePay chuyển khoản) cần chuyển thủ công rồi xác nhận mã tham chiếu ngân hàng.
        </p>
        {refunds.length > 0 ? (
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Đã hoàn:</span>{' '}
            <span className="font-semibold">{formatVnd(sumSucceeded(refunds))}</span>
            {inProgress > 0 ? (
              <span className="text-muted-foreground"> · Đang xử lý: {inProgress}</span>
            ) : null}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4" /> {error}
          </p>
        ) : null}
        {refunds.map((refund) => {
          const auto = isAuto(refund);
          const statusLabel =
            refund.status === 'succeeded' && auto ? 'Đã hoàn tự động' : REFUND_STATUS_LABEL[refund.status];
          return (
            <div key={refund.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to={dashboardPaths.tenant.booking(refund.bookingId)}
                    className="inline-flex items-center gap-1 font-mono text-sm font-medium text-primary hover:underline"
                  >
                    {refund.bookingCode} <ArrowUpRight className="size-3.5" />
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">
                      {auto ? <Wallet className="size-3" /> : null}
                      {auto ? 'Tự động' : 'Thủ công'}
                    </span>
                    <span>· {refund.reason ?? 'Hoàn tiền'}</span>
                    <span>· {formatDateTime(refund.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {refund.executionMode === 'automatic'
                      ? 'Tự động qua cổng thanh toán'
                      : 'Xử lý thủ công'}
                    {refund.dueAt && refund.status === 'manual_required'
                      ? ` · hạn ${formatDateTime(refund.dueAt)}`
                      : ''}
                  </p>
                  {!refund.affectsBookingStatus ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Khoản hoàn này không kết thúc trạng thái dịch vụ của booking.
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatVnd(refund.amount)}</p>
                  <Badge
                    variant={
                      refund.status === 'failed'
                        ? 'destructive'
                        : refund.status === 'succeeded'
                          ? 'default'
                          : 'secondary'
                    }
                  >
                    {statusLabel}
                  </Badge>
                </div>
              </div>

              {refund.status === 'manual_required' && canManage ? (
                <Form
                  method="post"
                  className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2"
                  onSubmit={handleSubmit}
                >
                  <input type="hidden" name="intent" value="confirm-refund" />
                  <input type="hidden" name="refundId" value={refund.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor={`refund-reference-${refund.id}`}>Mã tham chiếu ngân hàng</Label>
                    <Input
                      id={`refund-reference-${refund.id}`}
                      name="reference"
                      required
                      maxLength={200}
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`refund-evidence-${refund.id}`}>Khóa bằng chứng</Label>
                    <Input
                      id={`refund-evidence-${refund.id}`}
                      name="evidenceKey"
                      maxLength={500}
                      placeholder="refunds/... hoặc URL nội bộ"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`refund-note-${refund.id}`}>Ghi chú</Label>
                    <Textarea
                      id={`refund-note-${refund.id}`}
                      name="note"
                      maxLength={500}
                      rows={2}
                      disabled={busy}
                    />
                  </div>
                  <div className="md:col-span-2 md:text-right">
                    <Button type="submit" disabled={busy}>
                      {busy ? 'Đang xác nhận…' : 'Xác nhận đã chuyển hoàn'}
                    </Button>
                  </div>
                </Form>
              ) : refund.status === 'succeeded' && auto ? (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  Mã giao dịch hoàn:{' '}
                  <span className="font-mono text-foreground">{refund.gatewayRefundId}</span>
                </p>
              ) : refund.reference ? (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  Mã tham chiếu:{' '}
                  <span className="font-mono text-foreground">{refund.reference}</span>
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
